import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runLiveHarness } from "../respond/route";
import {
  initialReceptionConversationState,
  receptionConversationStateSchema,
} from "../../../../utils/receptionConversation";

const turnSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  turnNumber: z.number().int().min(1).max(6).default(1),
  forceClose: z.boolean().default(false),
  conversationState: receptionConversationStateSchema.optional(),
  history: z
    .array(
      z.object({
        speaker: z.enum(["caller", "receptionist"]),
        text: z.string().trim().min(1).max(1200),
      }),
    )
    .max(8)
    .default([]),
});

export function hasVoiceWorkerAccess(request: Request) {
  const secret = process.env.VOICE_WORKER_SHARED_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!secret || secret.length < 32 || !supplied) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(supplied);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function POST(request: Request) {
  if (!hasVoiceWorkerAccess(request)) {
    return NextResponse.json(
      { error: "Voice worker access denied." },
      { status: 401 },
    );
  }
  if (
    process.env.MENTAL_HEALTH_DEMO_ENABLED === "false" ||
    process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED === "false"
  ) {
    return NextResponse.json(
      { error: "The voice demonstration is temporarily unavailable." },
      { status: 503 },
    );
  }

  const parsed = turnSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid voice turn." }, { status: 400 });
  }

  try {
    const result = await runLiveHarness(parsed.data.message, "receptionist", {
      history: parsed.data.history,
      turnNumber: parsed.data.turnNumber,
      forceClose: parsed.data.forceClose,
      conversationState:
        parsed.data.conversationState ?? initialReceptionConversationState(),
    });
    return NextResponse.json(
      {
        reviewed: true,
        reply: result.reply,
        route: result.route,
        conversationComplete: result.conversationComplete,
        conversationState: result.conversationState,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "The reviewed voice turn timed out."
          : "The reviewed voice turn is unavailable.",
      },
      { status: 503 },
    );
  }
}

export const runtime = "nodejs";
