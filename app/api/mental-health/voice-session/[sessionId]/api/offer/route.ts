import { NextResponse } from "next/server";
import { z } from "zod";

const sessionSchema = z.string().uuid();

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

async function proxyOffer(request: Request, context: RouteContext) {
  const workerUrl = process.env.VOICE_WORKER_URL?.replace(/\/$/, "");
  const workerSecret = process.env.VOICE_WORKER_SHARED_SECRET;
  const { sessionId } = await context.params;
  if (!workerUrl || !workerSecret || workerSecret.length < 32) {
    return NextResponse.json(
      { error: "Voice signaling is not configured." },
      { status: 503 },
    );
  }
  if (!sessionSchema.safeParse(sessionId).success) {
    return NextResponse.json(
      { error: "Invalid voice session." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `${workerUrl}/sessions/${encodeURIComponent(sessionId)}/api/offer`,
      {
        method: request.method,
        headers: {
          Authorization: `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
        },
        body: await request.text(),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Voice signaling is unavailable." },
      { status: 503 },
    );
  }
}

export const POST = proxyOffer;
export const PATCH = proxyOffer;
export const runtime = "nodejs";
