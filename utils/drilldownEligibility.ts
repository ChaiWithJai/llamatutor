const COMPUTABLE_TOPIC =
  /\b(calculate|compute|convert|equation|evaluate|factor|graph|integral|interest|mean|median|percentage|plot|probability|rate|ratio|solve|speed|standard deviation|volume)\b/i;
const FORMULA =
  /(?:\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\b[a-z][a-z0-9_]*\s*=\s*[a-z0-9_.()]+(?:\s*[-+*/^]\s*[a-z0-9_.()]+)+|(?:\d+(?:\.\d+)?)\s*[-+*/^]\s*(?:\d+(?:\.\d+)?))/i;

/**
 * Wolfram drilldown is an earned affordance, not a generic "more" button.
 * Return a query only when the card names a computational job or contains an
 * explicit expression that Wolfram can evaluate.
 */
export function computableDrilldownQuery(
  title: string,
  body: string,
): string | null {
  const cleanTitle = title.trim();
  if (!cleanTitle) return null;

  if (COMPUTABLE_TOPIC.test(cleanTitle)) return cleanTitle;

  const formula = body.match(FORMULA)?.[0]?.trim();
  return formula ? `${cleanTitle}: ${formula}` : null;
}

export function isRetryableDrilldownStatus(status: number): boolean {
  return status === 429 || status >= 502;
}
