import { describe, expect, it } from "vitest";
import { goldenLearningBlockFixtures } from "../evaluation/learning-blocks/goldenFixtures";
import {
  evaluateFixture,
  evaluateSuite,
} from "../evaluation/learning-blocks/evaluate";
import thresholdsJson from "../evaluation/learning-blocks/thresholds.json";
import type { LearningBlockThresholds } from "../evaluation/learning-blocks/types";
import {
  citedSourceIds,
  learningResponseSchema,
  parseLearningResponse,
} from "./learningBlocks";

const thresholds = thresholdsJson as LearningBlockThresholds;

describe("typed learning blocks", () => {
  it("accepts a versioned, supported response", () => {
    const parsed = learningResponseSchema.parse({
      schemaVersion: "1.0",
      blocks: [
        {
          type: "check",
          prompt: "Which balance earns next period's interest?",
          options: ["The original balance", "The updated balance"],
          answer: 1,
        },
      ],
    });

    expect(parsed.blocks[0]?.type).toBe("check");
  });

  it("rejects raw HTML and unknown block types with a plain-text fallback", () => {
    const rawHtml = parseLearningResponse({
      schemaVersion: "1.0",
      blocks: [
        {
          type: "explanation",
          title: "Unsafe",
          markdown: "<script>alert('no')</script>",
        },
      ],
    });
    const unknownBlock = parseLearningResponse({
      schemaVersion: "1.0",
      blocks: [{ type: "generated_html", html: "<b>unsafe</b>" }],
    });

    expect(rawHtml.ok).toBe(false);
    expect(unknownBlock.ok).toBe(false);
    if (!rawHtml.ok) expect(rawHtml.fallbackText).toContain("<script>");
  });

  it("rejects an answer index outside the supplied options", () => {
    expect(
      learningResponseSchema.safeParse({
        schemaVersion: "1.0",
        blocks: [
          {
            type: "check",
            prompt: "Pick one",
            options: ["A", "B"],
            answer: 2,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("collects unique source IDs from source callouts", () => {
    const response = learningResponseSchema.parse({
      schemaVersion: "1.0",
      blocks: [
        {
          type: "source_callout",
          sourceIds: ["source-a", "source-a", "source-b"],
          claim: "A grounded claim.",
        },
      ],
    });

    expect(citedSourceIds(response)).toEqual(["source-a", "source-b"]);
  });

  it("makes every checked-in golden fixture behave as declared", () => {
    const results = goldenLearningBlockFixtures.map(evaluateFixture);
    expect(results).toHaveLength(9);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(
      results.find((result) => result.fixtureId === "unknown-source-id")
        ?.missingSourceIds,
    ).toEqual(["invented-source"]);
  });

  it("fails a rejected candidate when the learner would see no fallback", () => {
    const injectedFixture = goldenLearningBlockFixtures.find(
      (fixture) => fixture.id === "prompt-injected-image-text",
    )!;
    const result = evaluateFixture({
      ...injectedFixture,
      run: { ...injectedFixture.run, fallbackShown: false },
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toContain(
      "Rejected output did not show a plain-text fallback",
    );
  });

  it("cannot pass the live release gate without complete live evidence", () => {
    const report = evaluateSuite(goldenLearningBlockFixtures, thresholds);

    expect(report.passed).toBe(false);
    expect(report.decisionsNeeded).toEqual([]);
    expect(report.metrics.missingLiveFixtureIds).toHaveLength(9);
    expect(report.metrics.validTopLevelSchemaRate).toBe(5 / 7);
    expect(report.metrics.rawHtmlBlocks).toBe(1);
    expect(report.metrics.truthfulFailureRate).toBe(1);
  });

  it("passes only after live metadata satisfies accepted budgets", () => {
    const safeFixtures = goldenLearningBlockFixtures.filter(
      (fixture) => fixture.expectedPass,
    );
    const report = evaluateSuite(
      safeFixtures,
      { ...thresholds, p95LatencyMs: 4_000, maxCostUsd: 0.05 },
      safeFixtures.map((fixture, index) => ({
        fixtureId: fixture.id,
        outcome: fixture.run.outcome,
        provider: "fixture-provider",
        endpoint: "fixture-endpoint",
        model: "fixture-model",
        schemaVersion: "1.0",
        startedAt: `2026-07-30T15:00:0${index}.000Z`,
        endpointAvailable: true,
        httpStatus: 200,
        timeToFirstTokenMs: 250,
        totalLatencyMs: 1_000 + index,
        inputTokens: 100,
        outputTokens: 200,
        imageCount: fixture.imageIds.length,
        costUsd: 0.01,
      })),
    );

    expect(report.passed).toBe(true);
    expect(report.decisionsNeeded).toEqual([]);
  });

  it("does not treat partial live coverage as a release-ready evaluation", () => {
    const safeFixtures = goldenLearningBlockFixtures.filter(
      (fixture) => fixture.expectedPass,
    );
    const report = evaluateSuite(
      safeFixtures,
      { ...thresholds, p95LatencyMs: 4_000, maxCostUsd: 0.05 },
      [
        {
          fixtureId: safeFixtures[0]!.id,
          outcome: safeFixtures[0]!.run.outcome,
          provider: "fixture-provider",
          endpoint: "fixture-endpoint",
          model: "fixture-model",
          schemaVersion: "1.0",
          startedAt: "2026-07-30T15:00:00.000Z",
          endpointAvailable: true,
          httpStatus: 200,
          timeToFirstTokenMs: 250,
          totalLatencyMs: 1_000,
          inputTokens: 100,
          outputTokens: 200,
          imageCount: 0,
          costUsd: 0.01,
        },
      ],
    );

    expect(report.passed).toBe(false);
    expect(report.metrics.missingLiveFixtureIds).toHaveLength(
      safeFixtures.length - 1,
    );
  });

  it("does not demand token usage from intentional cancellation or failure fixtures", () => {
    const safeFixtures = goldenLearningBlockFixtures.filter(
      (fixture) => fixture.expectedPass,
    );
    const report = evaluateSuite(
      safeFixtures,
      { ...thresholds, p95LatencyMs: 4_000, maxCostUsd: 0.05 },
      safeFixtures.map((fixture, index) => ({
        fixtureId: fixture.id,
        outcome: fixture.run.outcome,
        provider: "fixture-provider",
        endpoint: "fixture-endpoint",
        model: "fixture-model",
        schemaVersion: "1.0",
        startedAt: `2026-07-30T15:00:0${index}.000Z`,
        endpointAvailable: fixture.run.outcome === "completed",
        httpStatus: fixture.run.outcome === "provider_error" ? 400 : 200,
        timeToFirstTokenMs: fixture.run.outcome === "completed" ? 250 : null,
        totalLatencyMs:
          fixture.run.outcome === "completed" ? 1_000 + index : null,
        inputTokens: fixture.run.outcome === "completed" ? 100 : null,
        outputTokens: fixture.run.outcome === "completed" ? 200 : null,
        imageCount: fixture.imageIds.length,
        costUsd: fixture.run.outcome === "completed" ? 0.01 : null,
      })),
    );

    expect(report.metrics.endpointAvailabilityRate).toBe(1);
    expect(report.metrics.usageCompleteRate).toBe(1);
    expect(report.passed).toBe(true);
  });
});
