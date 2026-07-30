"use client";

import { useMemo, useRef, useState } from "react";
import { chunkIntoCards } from "@/utils/carousel";
import DrilldownPanel from "@/components/DrilldownPanel";
import TutorMarkdown from "@/components/TutorMarkdown";
import { computableDrilldownQuery } from "@/utils/drilldownEligibility";

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
  onInspectSource,
  onWorkExample,
}: {
  content: string;
  sources: { name: string; url: string }[];
  signedIn: boolean;
  onInspectSource?: (sourceUrl: string) => void;
  onWorkExample: () => void;
}) {
  const cards = useMemo(
    () => chunkIntoCards(content, sources),
    [content, sources],
  );
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (cards.length === 0) return null;

  const clampedIndex = Math.min(index, cards.length - 1);
  const card = cards[clampedIndex];
  const drilldownQuery = computableDrilldownQuery(card.title, card.body);
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
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start === null || end === undefined || Math.abs(start - end) < 48) {
          return;
        }
        goTo(start > end ? clampedIndex + 1 : clampedIndex - 1);
      }}
    >
      <div className="card-viewport">
        <article
          className="carousel-card"
          aria-label={`Card ${clampedIndex + 1} of ${cards.length}`}
        >
          <header className="card-heading">
            <div>
              <p className="card-eyebrow">
                Learning card {clampedIndex + 1} of {cards.length}
              </p>
              <h2>{card.title}</h2>
            </div>
            {cards.length > 1 && (
              <div className="carousel-stepper" aria-label="Card navigation">
                <button
                  type="button"
                  onClick={() => goTo(clampedIndex - 1)}
                  disabled={clampedIndex === 0}
                  aria-label="Previous card"
                >
                  ←
                </button>
                <span aria-live="polite">
                  {clampedIndex + 1} / {cards.length}
                </span>
                <button
                  type="button"
                  onClick={() => goTo(clampedIndex + 1)}
                  disabled={clampedIndex === cards.length - 1}
                  aria-label="Next card"
                >
                  →
                </button>
              </div>
            )}
          </header>
          <div className="card-body">
            <TutorMarkdown>{card.body}</TutorMarkdown>
            <div className="card-body-scroll-cue" aria-hidden="true" />
          </div>
          <div className="card-footer">
            {card.sourceName && card.sourceUrl ? (
              <button
                className="card-source-chip"
                type="button"
                onClick={() => onInspectSource?.(card.sourceUrl!)}
                aria-label={`Inspect source: ${card.sourceName}`}
              >
                <span aria-hidden="true">↗</span>
                {hostnameOf(card.sourceUrl)}
              </button>
            ) : (
              <span className="card-source-chip card-source-chip-empty">
                unverified
              </span>
            )}
            {drilldownQuery && (
              <DrilldownPanel
                key={clampedIndex}
                query={drilldownQuery}
                signedIn={signedIn}
                onFallback={onWorkExample}
              />
            )}
          </div>
        </article>
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
                dotIndex === clampedIndex
                  ? "carousel-dot carousel-dot-active"
                  : "carousel-dot"
              }
              onClick={() => goTo(dotIndex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
