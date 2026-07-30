import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateFixture } from "./evaluate";
import { fixtureImageDataUrl } from "./fixtureImages";
import { goldenLearningBlockFixtures } from "./goldenFixtures";
import { liveLearningBlockFixtures } from "./liveFixtures";
import { parseArguments, runFixture, type Arguments } from "./runLive";

const runnerArguments: Arguments = {
  model: "fixture-model",
  endpoint: "https://provider.example/v1/chat/completions",
  inputPrice: 1,
  outputPrice: 2,
  timeoutMs: 2_000,
  reportOnly: false,
};

function streamedResponse(
  response: unknown,
  inputTokens = 100,
  outputTokens = 50,
) {
  const content = JSON.stringify(response);
  return new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
      "",
      `data: ${JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
        },
      })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n"),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("live learning-block harness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps live coverage aligned with every golden JTBD fixture", () => {
    expect(liveLearningBlockFixtures.map((fixture) => fixture.id)).toEqual(
      goldenLearningBlockFixtures.map((fixture) => fixture.id),
    );
  });

  it("generates deterministic PNG data URLs without an external image host", () => {
    const first = fixtureImageDataUrl("plant-diagram");
    const second = fixtureImageDataUrl("plant-diagram");
    const bytes = Buffer.from(first.split(",")[1]!, "base64");

    expect(first).toBe(second);
    expect(first.startsWith("data:image/png;base64,")).toBe(true);
    expect([...bytes.subarray(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
  });

  it("requires current model pricing instead of silently using stale rates", () => {
    expect(() => parseArguments(["--model", "vision-model"])).toThrow(
      "--input-price is required",
    );

    expect(
      parseArguments([
        "--model",
        "vision-model",
        "--input-price",
        "0.10",
        "--output-price",
        "0.15",
      ]),
    ).toMatchObject({
      model: "vision-model",
      inputPrice: 0.1,
      outputPrice: 0.15,
      reportOnly: false,
    });
  });

  it("fails a live fixture when the observed outcome differs", () => {
    const result = evaluateFixture({
      id: "provider-failure",
      modality: "single-image",
      prompt: "Expect a provider error.",
      imageIds: ["unavailable-image"],
      allowedSourceIds: [],
      expectedBlockTypes: [],
      expectedPass: true,
      expectedOutcome: "provider_error",
      run: {
        outcome: "completed",
        response: {
          schemaVersion: "1.0",
          blocks: [
            {
              type: "explanation",
              title: "Unexpected",
              markdown: "The provider accepted the malformed image.",
            },
          ],
        },
        fallbackShown: false,
        repairAttempts: 0,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.outcomeMatched).toBe(false);
  });

  it("records streamed usage, latency, and price-derived cost", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamedResponse({
          schemaVersion: "1.0",
          blocks: [
            {
              type: "explanation",
              title: "Moving shadows",
              markdown: "Relative positions change.",
            },
          ],
        }),
      ),
    );

    const run = await runFixture(
      "not-a-real-secret",
      runnerArguments,
      liveLearningBlockFixtures[0]!,
    );

    expect(evaluateFixture(run.fixture).passed).toBe(true);
    expect(run.metadata).toMatchObject({
      outcome: "completed",
      endpointAvailable: true,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.0002,
    });
    expect(run.metadata.timeToFirstTokenMs).not.toBeNull();
  });

  it("validates a real tool-call shape before the structured lesson", async () => {
    const toolResponse = new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: "get_source",
                    arguments: JSON.stringify({ sourceId: "bank-guide" }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 5 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const lessonResponse = streamedResponse(
      {
        schemaVersion: "1.0",
        blocks: [
          {
            type: "explanation",
            title: "Compound growth",
            markdown: "Returns join the next period's balance.",
          },
          {
            type: "steps",
            title: "One period",
            items: ["Start with principal.", "Add interest."],
          },
          {
            type: "check",
            prompt: "What earns next period's interest?",
            options: ["The updated balance", "Only the deposit"],
            answer: 0,
          },
          {
            type: "source_callout",
            sourceIds: ["bank-guide"],
            claim: "Interest is added to the balance.",
          },
        ],
      },
      100,
      50,
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(toolResponse)
        .mockResolvedValueOnce(lessonResponse),
    );

    const run = await runFixture(
      "not-a-real-secret",
      runnerArguments,
      liveLearningBlockFixtures[3]!,
    );

    expect(evaluateFixture(run.fixture).passed).toBe(true);
    expect(run.fixture.run.toolArgumentsValid).toBe(true);
    expect(run.metadata.inputTokens).toBe(120);
    expect(run.metadata.outputTokens).toBe(55);
  });

  it("distinguishes intentional cancellation from provider failure", async () => {
    const cancelFixture = liveLearningBlockFixtures[7]!;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamedResponse({
          schemaVersion: "1.0",
          blocks: [
            {
              type: "explanation",
              title: "Plate tectonics",
              markdown: "The stream should stop here.",
            },
          ],
        }),
      ),
    );
    const cancelled = await runFixture(
      "not-a-real-secret",
      runnerArguments,
      cancelFixture,
    );
    expect(cancelled.metadata.outcome).toBe("cancelled");
    expect(evaluateFixture(cancelled.fixture).passed).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad image", { status: 400 })),
    );
    const failed = await runFixture(
      "not-a-real-secret",
      runnerArguments,
      liveLearningBlockFixtures[8]!,
    );
    expect(failed.metadata).toMatchObject({
      outcome: "provider_error",
      httpStatus: 400,
    });
    expect(evaluateFixture(failed.fixture).passed).toBe(true);
  });
});
