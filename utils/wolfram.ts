export type DrilldownResult = {
  interpretation: string | null;
  result: string | null;
  images: string[];
  websiteUrl: string | null;
  raw: string;
};

const WEBSITE_LINE = /Wolfram\|Alpha website result for/i;
const IMAGE_LINE = /^image:\s*(\S+)/i;

/**
 * The Wolfram|Alpha LLM API returns plain text formatted for direct
 * inclusion in an LLM prompt, not JSON -- see
 * https://products.wolframalpha.com/llm-api/documentation. This parses just
 * enough structure to render a card: the input interpretation, the primary
 * result line, any image URLs, and the canonical website link.
 */
export function parseDrilldownText(raw: string): DrilldownResult {
  const lines = raw.split("\n");
  const images: string[] = [];
  let interpretation: string | null = null;
  let result: string | null = null;
  let websiteUrl: string | null = null;

  let section: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const imageMatch = trimmed.match(IMAGE_LINE);
    if (imageMatch) {
      images.push(imageMatch[1]);
      continue;
    }

    if (WEBSITE_LINE.test(trimmed)) {
      const next = lines[index + 1]?.trim();
      if (next?.startsWith("http")) websiteUrl = next;
      section = null;
      continue;
    }

    if (/^Input interpretation:$/i.test(trimmed)) {
      section = "interpretation";
      continue;
    }
    if (/^Result:$/i.test(trimmed)) {
      section = "result";
      continue;
    }
    if (/:$/.test(trimmed)) {
      // Any other "Section name:" heading ends whichever section we were
      // capturing -- only interpretation/result are surfaced on the card.
      section = null;
      continue;
    }

    if (section === "interpretation" && !interpretation) {
      interpretation = trimmed;
    } else if (section === "result" && !result) {
      result = trimmed;
    }
  }

  return { interpretation, result, images, websiteUrl, raw };
}

export async function fetchDrilldown(
  query: string,
  appId: string,
  maxChars = 800,
): Promise<
  | { ok: true; data: DrilldownResult }
  | { ok: false; status: number; message: string }
> {
  const url = new URL("https://www.wolframalpha.com/api/v1/llm-api");
  url.searchParams.set("input", query);
  url.searchParams.set("appid", appId);
  url.searchParams.set("maxchars", String(maxChars));

  const response = await fetch(url.toString());
  const text = await response.text();

  if (!response.ok) {
    return { ok: false, status: response.status, message: text.trim() };
  }

  return { ok: true, data: parseDrilldownText(text) };
}
