"use client";

import { useState } from "react";
import type { DrilldownResult } from "@/utils/wolfram";
import { isRetryableDrilldownStatus } from "@/utils/drilldownEligibility";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: DrilldownResult }
  | { status: "error"; message: string; retryable: boolean };

export default function DrilldownPanel({
  query,
  signedIn,
  onFallback,
}: {
  query: string;
  signedIn: boolean;
  onFallback: () => void;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  const run = async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/drilldown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const body = await response.json();
      if (!response.ok) {
        setState({
          status: "error",
          message: body?.error ?? "Wolfram|Alpha could not compute that.",
          retryable: isRetryableDrilldownStatus(response.status),
        });
        return;
      }
      setState({ status: "ok", data: body });
    } catch {
      setState({
        status: "error",
        message: "The computation service is temporarily unavailable.",
        retryable: true,
      });
    }
  };

  const download = () => {
    if (state.status !== "ok") return;
    const { data } = state;
    const lines = [
      `# Drilldown: ${query}`,
      "",
      data.interpretation
        ? `**Input interpretation:** ${data.interpretation}`
        : "",
      data.result ? `**Result:** ${data.result}` : "",
      data.websiteUrl ? `\nSource: ${data.websiteUrl}` : "",
    ].filter(Boolean);
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drilldown-${query.slice(0, 40).replace(/[^a-z0-9]+/gi, "-")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (state.status === "idle") {
    return (
      <button
        className="drilldown-trigger"
        type="button"
        onClick={() => void run()}
      >
        Drill down
      </button>
    );
  }

  return (
    <div className="drilldown-panel" aria-live="polite">
      {state.status === "loading" && (
        <p className="drilldown-loading" aria-busy="true">
          Asking Wolfram|Alpha…
        </p>
      )}
      {state.status === "error" && (
        <div className="drilldown-error">
          <p>{state.message}</p>
          {state.retryable ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void run()}
            >
              Try again
            </button>
          ) : (
            <button
              className="secondary-button"
              type="button"
              onClick={onFallback}
            >
              Work an example instead
            </button>
          )}
        </div>
      )}
      {state.status === "ok" && (
        <div className="drilldown-result">
          <p className="drilldown-source-label">
            Wolfram|Alpha computed result
          </p>
          {state.data.interpretation && (
            <p className="drilldown-interpretation">
              {state.data.interpretation}
            </p>
          )}
          {state.data.result && (
            <p className="drilldown-value">{state.data.result}</p>
          )}
          {state.data.images.length > 0 && (
            // eslint-disable-next-line @next/next/no-img-element -- Wolfram-hosted image, dimensions are unknown ahead of fetch.
            <img
              className="drilldown-image"
              src={state.data.images[0]}
              alt={`Wolfram|Alpha figure for ${query}`}
            />
          )}
          {state.data.websiteUrl && (
            <a
              className="drilldown-website"
              href={state.data.websiteUrl}
              target="_blank"
              rel="noreferrer"
            >
              wolframalpha.com
            </a>
          )}
          {signedIn ? (
            <button
              className="secondary-button"
              type="button"
              onClick={download}
            >
              Download drilldown
            </button>
          ) : (
            <p className="drilldown-signin-hint">
              Sign in to save and download this.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
