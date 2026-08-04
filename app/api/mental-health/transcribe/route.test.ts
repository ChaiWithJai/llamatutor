import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const originalKey = process.env.TOGETHER_API_KEY;
const originalDemo = process.env.MENTAL_HEALTH_DEMO_ENABLED;
const originalLive = process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED;

afterEach(() => {
  vi.restoreAllMocks();
  restore("TOGETHER_API_KEY", originalKey);
  restore("MENTAL_HEALTH_DEMO_ENABLED", originalDemo);
  restore("MENTAL_HEALTH_LIVE_CALLER_ENABLED", originalLive);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function request(body: FormData) {
  return new Request("http://localhost/api/mental-health/transcribe", {
    method: "POST",
    body,
  });
}

function clip(bytes = 64) {
  const form = new FormData();
  form.append(
    "audio",
    new File([new Uint8Array(bytes)], "turn.webm", { type: "audio/webm" }),
  );
  form.append("sequence", "2");
  return form;
}

describe("live caller transcription", () => {
  it("fails closed behind the demo kill switch", async () => {
    process.env.MENTAL_HEALTH_DEMO_ENABLED = "false";
    const response = await POST(request(clip()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      reason: "disabled",
      fallback: "typed",
    });
  });

  it("has an independent kill switch for the live seat", async () => {
    process.env.MENTAL_HEALTH_DEMO_ENABLED = "true";
    process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED = "false";
    const response = await POST(request(clip()));
    expect(response.status).toBe(503);
  });

  it("offers typed input when no provider is configured", async () => {
    delete process.env.MENTAL_HEALTH_DEMO_ENABLED;
    delete process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED;
    delete process.env.TOGETHER_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(request(clip()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      reason: "unconfigured",
      fallback: "typed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds the clip it is willing to send", async () => {
    delete process.env.MENTAL_HEALTH_DEMO_ENABLED;
    delete process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED;
    process.env.TOGETHER_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(request(clip(2_000_001)));
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns transcript events the caller adapter can fold", async () => {
    delete process.env.MENTAL_HEALTH_DEMO_ENABLED;
    delete process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED;
    process.env.TOGETHER_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ text: "  I need an   appointment  " }),
    );

    const response = await POST(request(clip()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          eventId: "live-final-2",
          sequence: 2,
          kind: "final",
          text: "I need an appointment",
        },
      ],
    });
  });

  it("owns provider failure instead of leaking the error", async () => {
    delete process.env.MENTAL_HEALTH_DEMO_ENABLED;
    delete process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED;
    process.env.TOGETHER_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream exploded", { status: 500 }),
    );

    const response = await POST(request(clip()));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).not.toContain("upstream exploded");
    expect(body.fallback).toBe("typed");
  });

  it("asks for a retry rather than guessing at silence", async () => {
    delete process.env.MENTAL_HEALTH_DEMO_ENABLED;
    delete process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED;
    process.env.TOGETHER_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ text: "" }));

    const response = await POST(request(clip()));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      reason: "empty",
      fallback: "retry",
    });
  });
});
