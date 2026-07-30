import Image from "next/image";

export default function Sources({
  sources,
  isLoading,
  onRetry,
}: {
  sources: { name: string; url: string }[];
  isLoading: boolean;
  onRetry: () => void;
}) {
  return (
    <aside className="sources-panel" aria-labelledby="sources-title">
      <div className="sources-heading">
        <h2 id="sources-title">Named sources</h2>
        <p>Open any source to inspect what informed this session.</p>
      </div>
      <div className="sources-scroll-wrap">
        <div className="sources-list">
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
              <SourceCard source={source} key={source.url} />
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
      </div>
    </aside>
  );
}

const SourceCard = ({ source }: { source: { name: string; url: string } }) => {
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
      className="source-card"
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
