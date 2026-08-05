import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const originalUrl = process.env.VOICE_WORKER_URL;
const originalSecret = process.env.VOICE_WORKER_SHARED_SECRET;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalUrl === undefined) delete process.env.VOICE_WORKER_URL;
  else process.env.VOICE_WORKER_URL = originalUrl;
  if (originalSecret === undefined)
    delete process.env.VOICE_WORKER_SHARED_SECRET;
  else process.env.VOICE_WORKER_SHARED_SECRET = originalSecret;
});

describe("voice signaling proxy", () => {
  it("forwards a valid session offer with server-only worker access", async () => {
    process.env.VOICE_WORKER_URL = "https://voice.example.test";
    process.env.VOICE_WORKER_SHARED_SECRET = "s".repeat(32);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ sdp: "answer", type: "answer" }),
    );
    const request = new Request("http://localhost/offer", {
      method: "POST",
      body: JSON.stringify({ sdp: "offer", type: "offer" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
      }),
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "https://voice.example.test/sessions/123e4567-e89b-12d3-a456-426614174000/api/offer",
    );
    expect(
      (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).headers,
    ).toMatchObject({ Authorization: `Bearer ${"s".repeat(32)}` });
  });

  it("rejects an invalid session capability before reaching the worker", async () => {
    process.env.VOICE_WORKER_URL = "https://voice.example.test";
    process.env.VOICE_WORKER_SHARED_SECRET = "s".repeat(32);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://localhost/offer", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ sessionId: "not-a-session" }) },
    );
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
