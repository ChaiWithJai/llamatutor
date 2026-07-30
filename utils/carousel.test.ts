import { describe, expect, it } from "vitest";
import { chunkIntoCards } from "./carousel";

const sources = [
  { name: "Basketball — Britannica", url: "https://britannica.com/basketball" },
  { name: "Basketball — Wikipedia", url: "https://en.wikipedia.org/wiki/Basketball" },
];

describe("chunkIntoCards", () => {
  it("returns no cards for empty content", () => {
    expect(chunkIntoCards("", sources)).toEqual([]);
    expect(chunkIntoCards("   \n  ", sources)).toEqual([]);
  });

  it("splits on markdown headings when present", () => {
    const markdown = [
      "## The Game",
      "Five a side, one hoop each way.",
      "",
      "## Origins",
      "Invented in 1891 by James Naismith.",
    ].join("\n");

    const cards = chunkIntoCards(markdown, sources);
    expect(cards).toHaveLength(2);
    expect(cards[0].title).toBe("The Game");
    expect(cards[0].body).toContain("Five a side");
    expect(cards[1].title).toBe("Origins");
    expect(cards[1].body).toContain("James Naismith");
  });

  it("falls back to paragraph grouping when there are no headings", () => {
    const markdown = Array.from(
      { length: 4 },
      (_, index) => `Paragraph ${index} has some words in it to count toward the cap.`,
    ).join("\n\n");

    const cards = chunkIntoCards(markdown, sources);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("caps grouped paragraphs at roughly the target word count", () => {
    const longParagraph = Array.from({ length: 40 }, (_, i) => `word${i}`).join(
      " ",
    );
    const markdown = [longParagraph, longParagraph, longParagraph].join(
      "\n\n",
    );

    const cards = chunkIntoCards(markdown, sources);
    expect(cards.length).toBeGreaterThan(1);
  });

  it("cycles through the provided sources per card", () => {
    const markdown = ["## A", "one", "", "## B", "two", "", "## C", "three"].join(
      "\n",
    );
    const cards = chunkIntoCards(markdown, sources);
    expect(cards[0].sourceName).toBe(sources[0].name);
    expect(cards[1].sourceName).toBe(sources[1].name);
    expect(cards[2].sourceName).toBe(sources[0].name);
  });

  it("degrades to null source fields when no sources are available", () => {
    const cards = chunkIntoCards("## Only\nsection", []);
    expect(cards[0].sourceName).toBeNull();
    expect(cards[0].sourceUrl).toBeNull();
  });

  it("derives a title from the first sentence when a card has none", () => {
    const cards = chunkIntoCards(
      "Basketball was invented in 1891. It spread quickly.",
      sources,
    );
    expect(cards[0].title.length).toBeGreaterThan(0);
    expect(cards[0].title).not.toBe("Continued");
  });
});
