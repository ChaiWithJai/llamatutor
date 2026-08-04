import { NextResponse } from "next/server";
import { z } from "zod";
import { getReviewedTurn } from "../../../../utils/mentalHealthEdgeCases";
import { verifyReviewedSpeechGrant } from "../../../../utils/reviewedSpeechGrant";

/**
 * This endpoint speaks application-owned text only. There are exactly two ways
 * in: a position in a reviewed script, or text this server itself approved and
 * signed. Neither lets a browser choose what the branded voice says.
 */
const scriptedSchema = z.object({
  scenarioId: z.string().min(1).max(80),
  turnIndex: z.number().int().min(0).max(20),
});

const grantSchema = z.object({
  grant: z.object({
    text: z.string().min(1).max(1800),
    speaker: z.enum(["receptionist", "caller"]),
    expiresAt: z.number(),
    signature: z.string().min(1).max(200),
  }),
});

const DEFAULT_MODEL = "cartesia/sonic-2";
const DEFAULT_VOICES = {
  receptionist: "laidback woman",
  caller: "friendly sidekick",
} as const;

async function createSpeech(payload: unknown) {
  if (process.env.MENTAL_HEALTH_DEMO_ENABLED === "false") {
    return NextResponse.json(
      { error: "The voice demonstration is temporarily unavailable." },
      { status: 503 },
    );
  }

  const scripted = scriptedSchema.safeParse(payload);
  const granted = scripted.success ? null : grantSchema.safeParse(payload);

  if (!scripted.success && !granted?.success) {
    return NextResponse.json(
      { error: "Choose a reviewed conversation turn." },
      { status: 400 },
    );
  }

  let turn: { text: string; speaker: "receptionist" | "caller" } | undefined;
  if (scripted.success) {
    turn = getReviewedTurn(scripted.data.scenarioId, scripted.data.turnIndex);
    if (!turn) {
      return NextResponse.json(
        { error: "Unknown conversation turn." },
        { status: 404 },
      );
    }
  } else if (granted?.success) {
    if (!verifyReviewedSpeechGrant(granted.data.grant)) {
      return NextResponse.json(
        { error: "That response was not approved for speech." },
        { status: 403 },
      );
    }
    turn = {
      text: granted.data.grant.text,
      speaker: granted.data.grant.speaker,
    };
  }

  if (!turn) {
    return NextResponse.json(
      { error: "Unknown conversation turn." },
      { status: 404 },
    );
  }

  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Natural demo audio is not configured." },
      { status: 503 },
    );
  }

  const model = process.env.TOGETHER_TTS_MODEL ?? DEFAULT_MODEL;
  const voice =
    turn.speaker === "receptionist"
      ? (process.env.TOGETHER_TTS_RECEPTIONIST_VOICE ??
        DEFAULT_VOICES.receptionist)
      : (process.env.TOGETHER_TTS_CALLER_VOICE ?? DEFAULT_VOICES.caller);

  try {
    const response = await fetch("https://api.together.ai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: turn.text,
        voice,
        response_format: "mp3",
        language: "en",
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: "Natural demo audio is taking a pause." },
        { status: 502 },
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Voice-Provider": "together",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Natural demo audio is taking a pause." },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const turnIndex = url.searchParams.get("turnIndex");
  return createSpeech({
    scenarioId: url.searchParams.get("scenarioId"),
    turnIndex: turnIndex === null ? null : Number(turnIndex),
  });
}

export async function POST(request: Request) {
  return createSpeech(await request.json().catch(() => null));
}

export const runtime = "nodejs";
