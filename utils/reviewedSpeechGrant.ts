import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-only grant that keeps `/api/mental-health/speech` from becoming a
 * public text-to-speech proxy once live Maya replies exist.
 *
 * Simulation turns stay allowlisted by `scenarioId + turnIndex`. A live reply
 * has no script position, so the server signs the exact text it already
 * approved in `reviewMentalHealthOutput()` and speaks nothing else. The browser
 * can replay a grant it was given; it cannot mint one for text of its own.
 */

export const REVIEWED_SPEECH_GRANT_TTL_MS = 5 * 60 * 1000;

export type ReviewedSpeechGrant = {
  text: string;
  speaker: "receptionist" | "caller";
  expiresAt: number;
  signature: string;
};

function secret() {
  return (
    process.env.MENTAL_HEALTH_SPEECH_SECRET ?? process.env.TOGETHER_API_KEY ?? ""
  );
}

function sign(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("hex");
}

function payloadOf(grant: Omit<ReviewedSpeechGrant, "signature">) {
  return JSON.stringify([grant.speaker, grant.expiresAt, grant.text]);
}

export function issueReviewedSpeechGrant(options: {
  text: string;
  speaker: ReviewedSpeechGrant["speaker"];
  now?: number;
}): ReviewedSpeechGrant | null {
  const key = secret();
  if (!key) return null;
  const grant = {
    text: options.text,
    speaker: options.speaker,
    expiresAt: (options.now ?? Date.now()) + REVIEWED_SPEECH_GRANT_TTL_MS,
  };
  return { ...grant, signature: sign(payloadOf(grant), key) };
}

export function verifyReviewedSpeechGrant(
  grant: ReviewedSpeechGrant,
  now = Date.now(),
) {
  const key = secret();
  if (!key) return false;
  if (!Number.isFinite(grant.expiresAt) || grant.expiresAt < now) return false;

  const expected = Buffer.from(
    sign(
      payloadOf({
        text: grant.text,
        speaker: grant.speaker,
        expiresAt: grant.expiresAt,
      }),
      key,
    ),
    "hex",
  );
  const provided = Buffer.from(grant.signature, "hex");
  if (expected.length !== provided.length || expected.length === 0) return false;
  return timingSafeEqual(expected, provided);
}
