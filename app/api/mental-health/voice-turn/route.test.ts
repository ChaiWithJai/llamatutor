import { afterEach, describe, expect, it } from "vitest";
import { hasVoiceWorkerAccess, POST } from "./route";

const originalSecret = process.env.VOICE_WORKER_SHARED_SECRET;

afterEach(() => {
  if (originalSecret === undefined)
    delete process.env.VOICE_WORKER_SHARED_SECRET;
  else process.env.VOICE_WORKER_SHARED_SECRET = originalSecret;
});

function request(body: unknown, token?: string) {
  return new Request("http://localhost/api/mental-health/voice-turn", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("voice worker review boundary", () => {
  it("fails closed when the shared secret is absent or wrong", async () => {
    process.env.VOICE_WORKER_SHARED_SECRET = "a".repeat(32);
    const input = request({ message: "I need an appointment." }, "wrong");
    expect(hasVoiceWorkerAccess(input)).toBe(false);
    expect((await POST(input)).status).toBe(401);
  });

  it("accepts an exact, sufficiently long server secret", () => {
    const secret = "voice-worker-test-secret-material-123";
    process.env.VOICE_WORKER_SHARED_SECRET = secret;
    expect(hasVoiceWorkerAccess(request({}, secret))).toBe(true);
  });

  it("validates a turn before invoking metered providers", async () => {
    const secret = "voice-worker-test-secret-material-123";
    process.env.VOICE_WORKER_SHARED_SECRET = secret;
    const response = await POST(request({ message: "" }, secret));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid voice turn.",
    });
  });
});
