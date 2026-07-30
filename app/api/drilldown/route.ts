import { NextRequest, NextResponse } from "next/server";
import { fetchDrilldown } from "@/utils/wolfram";

export async function POST(request: NextRequest) {
  let query: string;
  try {
    const body = await request.json();
    query = typeof body?.query === "string" ? body.query.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: "A query is required." }, { status: 400 });
  }

  const appId = process.env.WOLFRAM_ALPHA_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { error: "Drilldown is not configured yet." },
      { status: 503 },
    );
  }

  try {
    const outcome = await fetchDrilldown(query, appId);
    if (!outcome.ok) {
      // 501 (uninterpretable input) and other non-2xx responses degrade
      // honestly -- never fabricate a computed answer. See issue #36.
      return NextResponse.json(
        {
          error: "Wolfram|Alpha could not compute that.",
          detail: outcome.message,
        },
        { status: outcome.status === 401 ? 502 : outcome.status },
      );
    }

    return NextResponse.json({ query, ...outcome.data });
  } catch (error) {
    console.error("Drilldown lookup failed", error);
    return NextResponse.json(
      { error: "Drilldown lookup failed." },
      { status: 502 },
    );
  }
}
