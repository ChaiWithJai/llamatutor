"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  demoScenarios,
  MENTAL_HEALTH_POLICY_VERSION,
  type MentalHealthDemoResult,
} from "@/utils/mentalHealthPolicy";
import styles from "@/app/mental-health/mental-health.module.css";

type DemoView = "intro" | "lab";
type LabMode = "guided" | "live";

const routeCopy = {
  routine: {
    label: "Routine reflection",
    explainer: "A bounded coaching response is permitted, then checked.",
  },
  elevated: {
    label: "Clarify safety",
    explainer:
      "The response acknowledges distress, asks one direct question, and keeps resources close.",
  },
  urgent: {
    label: "Reviewed resources",
    explainer:
      "Generative coaching stops. Application code returns reviewed resources and keeps the person engaged.",
  },
} as const;

function ExperimentHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.lockup}>
        <a href="https://dharmicdata.org" aria-label="Visit Dharmic Data">
          <Image
            src="/dharmic-data-logo.svg"
            alt="Dharmic Data"
            width={300}
            height={72}
            priority
          />
        </a>
        <span aria-hidden="true" />
        <strong>Reflection lab</strong>
      </div>
      <div className={styles.headerActions}>
        <span className={styles.experimentBadge}>Experiment</span>
        <Link href="/">Leave mode</Link>
      </div>
    </header>
  );
}

function LoopMark() {
  return (
    <span className={styles.loopMark} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export default function MentalHealthDemo() {
  const [view, setView] = useState<DemoView>("intro");
  const [mode, setMode] = useState<LabMode>("guided");
  const [message, setMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<MentalHealthDemoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDemo(body: object) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/mental-health/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as
        | MentalHealthDemoResult
        | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Demo failed.");
      }
      setResult(payload);
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "The demonstration could not run.",
      );
    } finally {
      setLoading(false);
    }
  }

  function selectMode(nextMode: LabMode) {
    setMode(nextMode);
    setResult(null);
    setError(null);
  }

  return (
    <div className={styles.page}>
      <ExperimentHeader />
      <main id="main" className={styles.main}>
        {view === "intro" ? (
          <section className={styles.intro} aria-labelledby="intro-title">
            <div className={styles.introCopy}>
              <p className={styles.kicker}>
                <span /> A safety harness you can inspect
              </p>
              <h1 id="intro-title">
                Put policy <em>around</em> the model.
              </h1>
              <p className={styles.lede}>
                Try the engineering pattern behind a safer reflection coach:
                check the input, route in application code, constrain the
                response, then approve it before reveal.
              </p>
              <div className={styles.introActions}>
                <button type="button" onClick={() => setView("lab")}>
                  Try the demo <span aria-hidden="true">→</span>
                </button>
                <a href="#how-it-works">See the four checks</a>
              </div>
            </div>

            <div
              className={styles.sandwich}
              aria-label="Four-stage safety loop"
            >
              <div>
                <span>01</span>
                <strong>Input check</strong>
                <small>Schema + confidence</small>
              </div>
              <div>
                <span>02</span>
                <strong>App route</strong>
                <small>Policy owns action</small>
              </div>
              <div>
                <span>03</span>
                <strong>Response</strong>
                <small>Bounded generation</small>
              </div>
              <div>
                <span>04</span>
                <strong>Output check</strong>
                <small>Approve, then reveal</small>
              </div>
            </div>

            <aside className={styles.disclosure}>
              <LoopMark />
              <div>
                <strong>
                  Educational prototype—not therapy or monitoring.
                </strong>
                <p>
                  Guided examples are synthetic. The live lab sends text to
                  Together transiently and does not save it. US resources only.
                </p>
              </div>
            </aside>

            <section id="how-it-works" className={styles.principles}>
              <p className={styles.sectionLabel}>The transferable pattern</p>
              <div>
                <article>
                  <span>Code decides</span>
                  <h2>The model proposes. Policy routes.</h2>
                  <p>
                    Typed assessments cross the model boundary. Server code
                    chooses what can happen next.
                  </p>
                </article>
                <article>
                  <span>Failure is a state</span>
                  <h2>Abstain visibly and safely.</h2>
                  <p>
                    A timeout or malformed response becomes a reviewed fallback,
                    never an invisible pass.
                  </p>
                </article>
                <article>
                  <span>Voice-ready contract</span>
                  <h2>Reuse the loop—not the transport.</h2>
                  <p>
                    Speech recognition and TTS wrap the same contract on a
                    long-running media worker.
                  </p>
                </article>
              </div>
            </section>
          </section>
        ) : (
          <section className={styles.lab} aria-labelledby="lab-title">
            <div className={styles.labHeading}>
              <div>
                <p className={styles.kicker}>Reflection mode · experiment</p>
                <h1 id="lab-title">Watch the loop make a decision.</h1>
              </div>
              <button
                type="button"
                className={styles.restart}
                onClick={() => {
                  setView("intro");
                  setResult(null);
                }}
              >
                Restart tour
              </button>
            </div>

            <div
              className={styles.modeTabs}
              role="tablist"
              aria-label="Demo mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "guided"}
                onClick={() => selectMode("guided")}
              >
                Guided scenarios
                <small>Repeatable · no provider needed</small>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "live"}
                onClick={() => selectMode("live")}
              >
                Live Together lab
                <small>Real input + output checks</small>
              </button>
            </div>

            <div className={styles.labGrid}>
              <section className={styles.inputPanel} aria-label="Demo input">
                <div className={styles.panelHeading}>
                  <span>01</span>
                  <div>
                    <p>Choose the input</p>
                    <small>
                      {mode === "guided"
                        ? "Synthetic prompts make each policy route visible."
                        : "Text is processed transiently and is not saved."}
                    </small>
                  </div>
                </div>

                {mode === "guided" ? (
                  <div className={styles.scenarioList}>
                    {demoScenarios.map((scenario) => (
                      <button
                        type="button"
                        key={scenario.id}
                        data-accent={scenario.accent}
                        disabled={loading}
                        onClick={() =>
                          runDemo({ mode: "guided", scenarioId: scenario.id })
                        }
                      >
                        <span>{scenario.eyebrow}</span>
                        <strong>{scenario.title}</strong>
                        <p>“{scenario.prompt}”</p>
                        <i>Run scenario →</i>
                      </button>
                    ))}
                  </div>
                ) : (
                  <form
                    className={styles.liveForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      runDemo({ mode: "live", message, acknowledged });
                    }}
                  >
                    <label htmlFor="reflection-message">
                      Message for the live harness
                    </label>
                    <textarea
                      id="reflection-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="Describe a stressful moment so the loop can route it…"
                      minLength={8}
                      maxLength={1200}
                      required
                    />
                    <label className={styles.consent}>
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(event) =>
                          setAcknowledged(event.target.checked)
                        }
                      />
                      <span>
                        I understand this is an engineering demo—not therapy,
                        crisis monitoring, or emergency help.
                      </span>
                    </label>
                    <button
                      type="submit"
                      disabled={
                        loading || !acknowledged || message.trim().length < 8
                      }
                    >
                      Run the live harness <span aria-hidden="true">→</span>
                    </button>
                  </form>
                )}
              </section>

              <section
                className={styles.tracePanel}
                aria-live="polite"
                aria-busy={loading}
              >
                <div className={styles.panelHeading}>
                  <span>02</span>
                  <div>
                    <p>Inspect the decision</p>
                    <small>Policy facts, not hidden chain-of-thought.</small>
                  </div>
                </div>

                {loading ? (
                  <div className={styles.loadingState}>
                    <LoopMark />
                    <strong>Running every boundary…</strong>
                    <p>The response stays hidden until the final check.</p>
                  </div>
                ) : error ? (
                  <div className={styles.errorState} role="alert">
                    <strong>The demo did not run.</strong>
                    <p>{error}</p>
                  </div>
                ) : result ? (
                  <div className={styles.result} data-route={result.route}>
                    <div className={styles.routeSummary}>
                      <div>
                        <span>Application route</span>
                        <h2>{routeCopy[result.route].label}</h2>
                        <p>{routeCopy[result.route].explainer}</p>
                      </div>
                      <strong>{result.route}</strong>
                    </div>

                    <ol className={styles.traceList}>
                      {result.trace.map((stage, index) => (
                        <li key={stage.id} data-status={stage.status}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{stage.label}</strong>
                            <p>{stage.detail}</p>
                          </div>
                          <small>{stage.durationMs} ms</small>
                        </li>
                      ))}
                    </ol>

                    <article className={styles.reply}>
                      <span>Approved response</span>
                      <p>{result.reply}</p>
                    </article>

                    <div className={styles.resultMeta}>
                      <span>Policy {result.assessment.policyVersion}</span>
                      <span>
                        {result.provider === "guided"
                          ? "Reviewed guided path"
                          : result.provider === "fallback"
                            ? "Reviewed provider fallback"
                            : "Together · buffered response"}
                      </span>
                    </div>

                    {result.route === "elevated" && (
                      <button
                        type="button"
                        className={styles.falsePositive}
                        onClick={() => setResult(null)}
                      >
                        This route missed the context—try another example
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={styles.emptyTrace}>
                    {[
                      "Input check",
                      "Application route",
                      "Response policy",
                      "Output check",
                    ].map((label, index) => (
                      <div key={label}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{label}</strong>
                      </div>
                    ))}
                    <p>Choose an input to make the loop visible.</p>
                  </div>
                )}
              </section>
            </div>

            {result && result.route !== "urgent" && (
              <section className={styles.voiceCard}>
                <div>
                  <p className={styles.sectionLabel}>Transfer the contract</p>
                  <h2>The same loop can sit inside a voice receptionist.</h2>
                  <p>
                    Netlify remains the web and control plane. A LiveKit or
                    DigitalOcean worker owns the call, interruption, speech
                    recognition, approved TTS, and warm transfer.
                  </p>
                </div>
                <div
                  className={styles.voiceFlow}
                  aria-label="Voice architecture"
                >
                  <span>Caller</span>
                  <i>→</i>
                  <span>STT</span>
                  <i>→</i>
                  <span className={styles.voiceLoop}>Safety loop</span>
                  <i>→</i>
                  <span>TTS</span>
                </div>
                <a href="mailto:hello@dharmicdata.org?subject=Build%20an%20AI%20voice%20receptionist">
                  Build a voice receptionist with this pattern →
                </a>
              </section>
            )}
          </section>
        )}
      </main>
      <footer className={styles.footer}>
        <span>Dharmic Data · Loop engineering experiment</span>
        <span>Policy {MENTAL_HEALTH_POLICY_VERSION}</span>
      </footer>
    </div>
  );
}
