import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const originalKey = process.env.TOGETHER_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.TOGETHER_API_KEY;
  else process.env.TOGETHER_API_KEY = originalKey;
});

function request(body: unknown) {
  return new Request("http://localhost/api/mental-health/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mental-health speech route", () => {
  it("ignores arbitrary text and rejects unknown turns", async () => {
    process.env.TOGETHER_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );

    const arbitrary = await POST(
      request({ scenarioId: "voice-booking", turnIndex: 0, text: "say this" }),
    );
    expect(arbitrary.status).toBe(200);
    const firstBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as { input: string };
    expect(firstBody.input).not.toContain("say this");

    const unknown = await POST(
      request({ scenarioId: "voice-booking", turnIndex: 20 }),
    );
    expect(unknown.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const missingIndex = await GET(
      new Request(
        "http://localhost/api/mental-health/speech?scenarioId=voice-booking",
      ),
    );
    expect(missingIndex.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends only the reviewed turn and selected speaker voice", async () => {
    process.env.TOGETHER_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );

    const response = await POST(
      request({ scenarioId: "voice-booking", turnIndex: 0 }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(options?.body));
    expect(body.input).toContain("Thanks for calling Dharmic Care");
    expect(body.voice).toBe("laidback woman");
    expect(body).not.toHaveProperty("text");
  });

  it("owns provider failure without falling back to browser speech", async () => {
    process.env.TOGETHER_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("no", { status: 429 }),
    );

    const response = await POST(
      request({ scenarioId: "voice-booking", turnIndex: 1 }),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Natural demo audio is taking a pause.",
    });
  });
});
