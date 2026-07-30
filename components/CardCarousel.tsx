"use client";

import ReactMarkdown from "react-markdown";
import { useMemo, useState } from "react";
import { chunkIntoCards } from "@/utils/carousel";
import DrilldownPanel from "@/components/DrilldownPanel";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function CardCarousel({
  content,
  sources,
  signedIn,
}: {
  content: string;
  sources: { name: string; url: string }[];
  signedIn: boolean;
}) {
  const cards = useMemo(() => chunkIntoCards(content, sources), [content, sources]);
  const [index, setIndex] = useState(0);

  if (cards.length === 0) return null;

  const clampedIndex = Math.min(index, cards.length - 1);
  const card = cards[clampedIndex];
  const goTo = (next: number) => {
    setIndex(Math.max(0, Math.min(cards.length - 1, next)));
  };

  return (
    <div
      className="card-carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label="Session explanation"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") goTo(clampedIndex + 1);
        if (event.key === "ArrowLeft") goTo(clampedIndex - 1);
      }}
    >
      {cards.length > 1 && (
        <span className="card-count-pill" aria-hidden="true">
          {clampedIndex + 1} / {cards.length}
        </span>
      )}
      <div className="card-viewport">
        <article className="carousel-card" aria-label={`Card ${clampedIndex + 1} of ${cards.length}`}>
          <p className="card-eyebrow">
            Card {clampedIndex + 1} · {card.title}
          </p>
          <div className="card-body">
            <ReactMarkdown>{card.body}</ReactMarkdown>
            <div className="card-body-scroll-cue" aria-hidden="true" />
          </div>
          <div className="card-footer">
            {card.sourceName && card.sourceUrl ? (
              <a
                className="card-source-chip"
                href={card.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {hostnameOf(card.sourceUrl)}
              </a>
            ) : (
              <span className="card-source-chip card-source-chip-empty">unverified</span>
            )}
            <DrilldownPanel
              key={clampedIndex}
              query={card.title}
              signedIn={signedIn}
            />
          </div>
        </article>
        {cards.length > 1 && clampedIndex < cards.length - 1 && (
          <button
            className="carousel-arrow carousel-arrow-next"
            type="button"
            onClick={() => goTo(clampedIndex + 1)}
            aria-label="Next card"
          >
            →
          </button>
        )}
      </div>
      {cards.length > 1 && (
        <div className="carousel-dots" role="tablist" aria-label="Cards">
          {cards.map((dotCard, dotIndex) => (
            <button
              key={dotCard.title + dotIndex}
              type="button"
              role="tab"
              aria-selected={dotIndex === clampedIndex}
              aria-label={`Go to card ${dotIndex + 1}`}
              className={
                dotIndex === clampedIndex ? "carousel-dot carousel-dot-active" : "carousel-dot"
              }
              onClick={() => goTo(dotIndex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
