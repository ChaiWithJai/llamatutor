import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  transport: z.enum(["webrtc", "daily"]).default("webrtc"),
});

function workerHeaders(): Record<string, string> {
  const secret = process.env.VOICE_WORKER_SHARED_SECRET;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export async function GET() {
  const workerUrl = process.env.VOICE_WORKER_URL?.replace(/\/$/, "");
  if (!workerUrl) {
    return NextResponse.json(
      { ready: false, reason: "Voice worker is not configured." },
      { status: 503 },
    );
  }
  try {
    const response = await fetch(`${workerUrl}/healthz`, {
      headers: workerHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`worker returned ${response.status}`);
    return NextResponse.json(await response.json(), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json(
      { ready: false, reason: "Voice worker is unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const workerUrl = process.env.VOICE_WORKER_URL?.replace(/\/$/, "");
  if (!workerUrl) {
    return NextResponse.json(
      { error: "Voice worker is not configured." },
      { status: 503 },
    );
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid voice transport." },
      { status: 400 },
    );
  }
  if (parsed.data.transport === "daily" && !process.env.DAILY_API_KEY) {
    return NextResponse.json(
      { error: "Daily transport is not configured." },
      { status: 503 },
    );
  }
  try {
    const workerPath = parsed.data.transport === "daily" ? "/daily" : "";
    const response = await fetch(`${workerUrl}${workerPath}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...workerHeaders() },
      body: JSON.stringify({
        transport: parsed.data.transport,
        enableDefaultIceServers: parsed.data.transport === "webrtc",
        createDailyRoom: parsed.data.transport === "daily",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response
      .json()
      .catch(() => ({ error: "Invalid worker response." }));
    const publicPayload =
      parsed.data.transport === "webrtc" &&
      typeof payload.sessionId === "string"
        ? {
            ...payload,
            connectionUrl: `/api/mental-health/voice-session/${payload.sessionId}/api/offer`,
          }
        : payload;
    return NextResponse.json(publicPayload, {
      status: response.status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json(
      { error: "Voice worker is unavailable." },
      { status: 503 },
    );
  }
}

export const runtime = "nodejs";
