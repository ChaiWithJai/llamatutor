import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const originalUrl = process.env.VOICE_WORKER_URL;
const originalDaily = process.env.DAILY_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalUrl === undefined) delete process.env.VOICE_WORKER_URL;
  else process.env.VOICE_WORKER_URL = originalUrl;
  if (originalDaily === undefined) delete process.env.DAILY_API_KEY;
  else process.env.DAILY_API_KEY = originalDaily;
});

function request(body: unknown) {
  return new Request("http://localhost/api/mental-health/voice-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("voice session control plane", () => {
  it("reports unconfigured worker state truthfully", async () => {
    delete process.env.VOICE_WORKER_URL;
    expect((await GET()).status).toBe(503);
  });

  it("keeps Daily credential-gated", async () => {
    process.env.VOICE_WORKER_URL = "https://voice.example.test";
    delete process.env.DAILY_API_KEY;
    const response = await POST(request({ transport: "daily" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Daily transport is not configured.",
    });
  });

  it("proxies SmallWebRTC startup without revealing provider keys", async () => {
    process.env.VOICE_WORKER_URL = "https://voice.example.test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ sessionId: "session-1", iceConfig: {} }),
    );
    const response = await POST(request({ transport: "webrtc" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionId: "session-1",
      iceConfig: {},
      connectionUrl:
        "/api/mental-health/voice-session/session-1/api/offer",
    });
    const body = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(body).toMatchObject({
      transport: "webrtc",
      enableDefaultIceServers: true,
    });
    expect(body).not.toHaveProperty("apiKey");
  });

  it("routes Daily startup to the Daily worker without exposing its key", async () => {
    process.env.VOICE_WORKER_URL = "https://voice.example.test";
    process.env.DAILY_API_KEY = "configured-server-side";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ sessionId: "session-daily", roomUrl: "private-room" }),
    );
    const response = await POST(request({ transport: "daily" }));
    expect(response.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "https://voice.example.test/daily/start",
    );
    const body = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(body).toMatchObject({
      transport: "daily",
      createDailyRoom: true,
    });
    expect(body).not.toHaveProperty("apiKey");
  });
});
