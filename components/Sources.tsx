"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export default function Sources({
  sources,
  isLoading,
  onRetry,
  expanded,
  onClose,
  activeSourceUrl,
}: {
  sources: { name: string; url: string }[];
  isLoading: boolean;
  onRetry: () => void;
  expanded: boolean;
  onClose: () => void;
  activeSourceUrl: string | null;
}) {
  const sourceRefs = useRef(new Map<string, HTMLAnchorElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const [showScrollCue, setShowScrollCue] = useState(false);
  const updateScrollCue = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    setShowScrollCue(list.scrollTop + list.clientHeight < list.scrollHeight - 4);
  }, []);

  useEffect(() => {
    if (!expanded || !activeSourceUrl) return;
    const source = sourceRefs.current.get(activeSourceUrl);
    source?.focus({ preventScroll: true });
    source?.scrollIntoView({ block: "nearest" });
    updateScrollCue();
  }, [activeSourceUrl, expanded, updateScrollCue]);

  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(updateScrollCue);
    return () => cancelAnimationFrame(frame);
  }, [expanded, isLoading, sources, updateScrollCue]);

  return (
    <aside
      className="sources-panel"
      aria-labelledby="sources-title"
      id="session-sources"
      hidden={!expanded}
    >
      <div className="sources-heading">
        <div>
          <h2 id="sources-title">Named sources</h2>
          <p>Inspect what informed this learning session.</p>
        </div>
        <button
          className="icon-button sources-close"
          type="button"
          onClick={onClose}
          aria-label="Close sources and return to lesson"
        >
          ×
        </button>
      </div>
      <div className="sources-scroll-wrap">
        <div className="sources-list" ref={listRef} onScroll={updateScrollCue}>
          {isLoading ? (
            Array.from({ length: 5 }, (_, index) => (
              <div
                className="loading-line"
                key={index}
                style={{ animationDelay: `${index * 0.08}s` }}
              />
            ))
          ) : sources.length > 0 ? (
            sources.map((source) => (
              <SourceCard
                source={source}
                key={source.url}
                active={source.url === activeSourceUrl}
                setRef={(element) => {
                  if (element) sourceRefs.current.set(source.url, element);
                  else sourceRefs.current.delete(source.url);
                }}
              />
            ))
          ) : (
            <div className="empty-state" role="status">
              <p>
                Sources are unavailable. The lesson can continue, but important
                claims remain unverified.
              </p>
              <button
                className="secondary-button"
                type="button"
                onClick={onRetry}
              >
                Retry sources
              </button>
            </div>
          )}
        </div>
        <div
          className="sources-scroll-cue"
          data-visible={showScrollCue}
          aria-hidden="true"
        />
      </div>
    </aside>
  );
}

const SourceCard = ({
  source,
  active,
  setRef,
}: {
  source: { name: string; url: string };
  active: boolean;
  setRef: (element: HTMLAnchorElement | null) => void;
}) => {
  let hostname = source.url;
  try {
    hostname = new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    // Keep the original URL as a transparent fallback.
  }

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className={active ? "source-card source-card-active" : "source-card"}
      ref={setRef}
    >
      <Image
        unoptimized
        src={`https://www.google.com/s2/favicons?domain=${source.url}&sz=128`}
        alt=""
        width={32}
        height={32}
      />
      <span className="source-card-copy">
        <strong>{source.name || hostname}</strong>
        <span>{hostname}</span>
      </span>
    </a>
  );
};
