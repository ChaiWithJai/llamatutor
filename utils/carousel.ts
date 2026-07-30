export type CarouselCard = {
  title: string;
  body: string;
  sourceName: string | null;
  sourceUrl: string | null;
};

const MAX_WORDS_PER_CARD = 65;
const HEADING_PATTERN = /^#{1,3}\s+(.+)$/;

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function titleFromBody(body: string): string {
  const firstSentence = body
    .replace(/[*_`]/g, "")
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim();
  if (!firstSentence) return "Continued";
  const words = firstSentence.split(/\s+/);
  return words.length <= 8 ? firstSentence : `${words.slice(0, 8).join(" ")}…`;
}

/**
 * Splits an assistant markdown response into bounded cards instead of one
 * unbounded scroll of prose. Prefers markdown headings as card boundaries;
 * falls back to grouping paragraphs up to MAX_WORDS_PER_CARD. See issue #36
 * -- overflow must be impossible by construction, not clamped.
 */
export function chunkIntoCards(
  markdown: string,
  sources: { name: string; url: string }[],
): CarouselCard[] {
  const text = markdown.trim();
  if (!text) return [];

  const lines = text.split("\n");
  const headingSections: { title: string | null; body: string[] }[] = [];
  let current: { title: string | null; body: string[] } = {
    title: null,
    body: [],
  };

  for (const line of lines) {
    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      if (current.title !== null || current.body.some((l) => l.trim())) {
        headingSections.push(current);
      }
      current = { title: heading[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.title !== null || current.body.some((l) => l.trim())) {
    headingSections.push(current);
  }

  const usesHeadings = headingSections.some((section) => section.title);
  const rawCards: { title: string | null; body: string }[] = usesHeadings
    ? headingSections
        .map((section) => ({
          title: section.title,
          body: section.body.join("\n").trim(),
        }))
        .filter((section) => section.title || section.body)
    : groupParagraphs(text);

  return rawCards.map((card, index) => {
    const source = sources.length
      ? sources[index % sources.length]
      : undefined;
    return {
      title: card.title ?? titleFromBody(card.body),
      body: card.body || card.title || "",
      sourceName: source?.name ?? null,
      sourceUrl: source?.url ?? null,
    };
  });
}

function groupParagraphs(text: string): { title: string | null; body: string }[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const cards: { title: string | null; body: string }[] = [];
  let bucket: string[] = [];
  let bucketWords = 0;

  for (const paragraph of paragraphs) {
    const words = wordCount(paragraph);
    if (bucket.length && bucketWords + words > MAX_WORDS_PER_CARD) {
      cards.push({ title: null, body: bucket.join("\n\n") });
      bucket = [];
      bucketWords = 0;
    }
    bucket.push(paragraph);
    bucketWords += words;
  }
  if (bucket.length) cards.push({ title: null, body: bucket.join("\n\n") });

  return cards.length ? cards : [{ title: null, body: text }];
}
