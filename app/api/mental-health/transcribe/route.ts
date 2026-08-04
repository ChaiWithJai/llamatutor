import { NextResponse } from "next/server";

/**
 * Server-only transcription adapter for the live caller seat.
 *
 * The browser posts one push-to-talk clip and receives transcript events. The
 * provider key stays on the server, the clip is bounded and never written
 * anywhere, and every failure has owned copy so the UI can offer typed input
 * instead of surfacing a provider error.
 */

const MAX_CLIP_BYTES = 2_000_000;
const MAX_TRANSCRIPT_CHARACTERS = 1200;
const TRANSCRIPTION_TIMEOUT_MS = 15_000;

const OWNED_FAILURES = {
  disabled: "The voice demonstration is temporarily unavailable.",
  unconfigured:
    "Live transcription is not configured, so the caller seat is typed for now.",
  tooLarge: "That turn was too long to transcribe. Try a shorter turn.",
  missing: "No audio arrived for that turn.",
  provider:
    "Transcription is taking a pause. You can type this turn, or continue as a simulation.",
  empty: "I did not catch that turn. Try again, or type it instead.",
} as const;

function ownedFailure(
  reason: keyof typeof OWNED_FAILURES,
  status: number,
  fallback: "typed" | "retry",
) {
  return NextResponse.json(
    { error: OWNED_FAILURES[reason], reason, fallback },
    { status },
  );
}

export async function POST(request: Request) {
  if (
    process.env.MENTAL_HEALTH_DEMO_ENABLED === "false" ||
    process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED === "false"
  ) {
    return ownedFailure("disabled", 503, "typed");
  }

  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) return ownedFailure("unconfigured", 503, "typed");

  let clip: File | null = null;
  let sequence = 0;
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    clip = audio instanceof File ? audio : null;
    const submitted = Number(form.get("sequence"));
    sequence = Number.isInteger(submitted) && submitted >= 0 ? submitted : 0;
  } catch {
    return ownedFailure("missing", 400, "typed");
  }

  if (!clip || clip.size === 0) return ownedFailure("missing", 400, "typed");
  if (clip.size > MAX_CLIP_BYTES) return ownedFailure("tooLarge", 413, "typed");

  const upstream = new FormData();
  upstream.append("model", process.env.TOGETHER_STT_MODEL ?? "openai/whisper-large-v3");
  upstream.append("language", "en");
  upstream.append("response_format", "json");
  upstream.append("file", clip, "turn.webm");

  // The caller's abort (End call, mode switch) must cancel provider work too.
  const timeout = AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS);
  const signal = request.signal
    ? AbortSignal.any([request.signal, timeout])
    : timeout;

  try {
    const response = await fetch(
      "https://api.together.xyz/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstream,
        signal,
      },
    );

    if (!response.ok) return ownedFailure("provider", 502, "typed");

    const payload = (await response.json()) as { text?: string };
    const text = (payload.text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TRANSCRIPT_CHARACTERS);
    if (!text) return ownedFailure("empty", 422, "retry");

    return NextResponse.json(
      {
        events: [
          {
            eventId: `live-final-${sequence}`,
            sequence,
            kind: "final" as const,
            text,
          },
        ],
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return ownedFailure("provider", 502, "typed");
  }
}

export const runtime = "nodejs";
