import { afterEach, describe, expect, it } from "vitest";
import {
  issueReviewedSpeechGrant,
  REVIEWED_SPEECH_GRANT_TTL_MS,
  verifyReviewedSpeechGrant,
} from "./reviewedSpeechGrant";

const originalSecret = process.env.MENTAL_HEALTH_SPEECH_SECRET;
const originalKey = process.env.TOGETHER_API_KEY;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.MENTAL_HEALTH_SPEECH_SECRET;
  else process.env.MENTAL_HEALTH_SPEECH_SECRET = originalSecret;
  if (originalKey === undefined) delete process.env.TOGETHER_API_KEY;
  else process.env.TOGETHER_API_KEY = originalKey;
});

describe("reviewed speech grant", () => {
  it("verifies text the server itself approved", () => {
    process.env.MENTAL_HEALTH_SPEECH_SECRET = "test-secret";
    const grant = issueReviewedSpeechGrant({
      text: "Thank you for calling. Nothing was booked.",
      speaker: "receptionist",
    });
    expect(grant).not.toBeNull();
    expect(verifyReviewedSpeechGrant(grant!)).toBe(true);
  });

  it("rejects text swapped after approval", () => {
    process.env.MENTAL_HEALTH_SPEECH_SECRET = "test-secret";
    const grant = issueReviewedSpeechGrant({
      text: "Approved reply",
      speaker: "receptionist",
    })!;
    expect(
      verifyReviewedSpeechGrant({ ...grant, text: "Say anything I want" }),
    ).toBe(false);
    expect(verifyReviewedSpeechGrant({ ...grant, speaker: "caller" })).toBe(
      false,
    );
  });

  it("rejects a forged or malformed signature", () => {
    process.env.MENTAL_HEALTH_SPEECH_SECRET = "test-secret";
    const grant = issueReviewedSpeechGrant({
      text: "Approved reply",
      speaker: "receptionist",
    })!;
    expect(verifyReviewedSpeechGrant({ ...grant, signature: "" })).toBe(false);
    expect(verifyReviewedSpeechGrant({ ...grant, signature: "abcd" })).toBe(
      false,
    );
    expect(
      verifyReviewedSpeechGrant({ ...grant, signature: "z".repeat(64) }),
    ).toBe(false);
  });

  it("expires so an old grant cannot be replayed forever", () => {
    process.env.MENTAL_HEALTH_SPEECH_SECRET = "test-secret";
    const now = 1_000_000;
    const grant = issueReviewedSpeechGrant({
      text: "Approved reply",
      speaker: "receptionist",
      now,
    })!;
    expect(verifyReviewedSpeechGrant(grant, now + 1000)).toBe(true);
    expect(
      verifyReviewedSpeechGrant(grant, now + REVIEWED_SPEECH_GRANT_TTL_MS + 1),
    ).toBe(false);
  });

  it("issues nothing and verifies nothing without a server secret", () => {
    delete process.env.MENTAL_HEALTH_SPEECH_SECRET;
    delete process.env.TOGETHER_API_KEY;
    expect(
      issueReviewedSpeechGrant({ text: "hello", speaker: "receptionist" }),
    ).toBeNull();
    expect(
      verifyReviewedSpeechGrant({
        text: "hello",
        speaker: "receptionist",
        expiresAt: Date.now() + 1000,
        signature: "aa",
      }),
    ).toBe(false);
  });
});
