"use client";

import Image from "next/image";
import Link from "next/link";
import { usePlausible } from "next-plausible";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/mental-health/mental-health.module.css";
import {
  MENTAL_HEALTH_POLICY_VERSION,
  voiceBookingChoices,
  voiceScenarios,
  type DemoScenario,
  type MentalHealthDemoResult,
  type VoiceBookingChoice,
} from "@/utils/mentalHealthPolicy";

type CallState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "awaitingChoice"
  | "interrupted"
  | "complete";

type VoiceAnalytics = {
  experiment_opened: { surface: "voice_demo" };
  scenario_selected: { scenario: string; synthetic: boolean };
  harness_completed: {
    route: string;
    policy: string;
    provider: string;
    synthetic: boolean;
  };
  voice_demo_started: { scenario: string };
  voice_demo_interrupted: { scenario: string };
  voice_demo_choice: { choice: string };
  voice_cta_selected: { route: string; policy: string };
  experiment_exited: { surface: "header" };
};

const stateCopy: Record<CallState, string> = {
  idle: "Ready for a demo call",
  connecting: "Connecting",
  listening: "Listening to the caller",
  thinking: "Finding the right next step",
  speaking: "Receptionist is speaking",
  awaitingChoice: "Your turn—choose what works",
  interrupted: "Audio paused—conversation kept",
  complete: "Conversation complete",
};

const outcomeCopy = {
  routine: {
    label: "Next step proposed",
    body: "The receptionist clarified the request and prepared a time for the practice to confirm. Nothing was booked or saved.",
  },
  elevated: {
    label: "Safety clarification asked",
    body: "The normal booking script paused so the receptionist could ask one direct question and keep help close.",
  },
  urgent: {
    label: "Normal flow stopped",
    body: "The receptionist did not improvise or continue scheduling. Reviewed US crisis options replaced generative output.",
  },
} as const;

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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

function Waveform({ active }: { active: boolean }) {
  return (
    <span className={styles.waveform} data-active={active} aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

function Header({ onExit }: { onExit: () => void }) {
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
        <strong>Voice Receptionist</strong>
      </div>
      <div className={styles.headerActions}>
        <span>Live product demo</span>
        <Link href="/" onClick={onExit}>
          Back to Tutor
        </Link>
      </div>
    </header>
  );
}

export default function MentalHealthDemo() {
  const plausible = usePlausible<VoiceAnalytics>();
  const [scenarioId, setScenarioId] = useState(voiceScenarios[0].id);
  const [callState, setCallState] = useState<CallState>("idle");
  const [result, setResult] = useState<MentalHealthDemoResult | null>(null);
  const [bookingChoice, setBookingChoice] = useState<VoiceBookingChoice | null>(
    null,
  );
  const [followUpReply, setFollowUpReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [liveResult, setLiveResult] = useState<MentalHealthDemoResult | null>(
    null,
  );
  const [liveLoading, setLiveLoading] = useState(false);
  const runId = useRef(0);
  const speechId = useRef(0);
  const completionTimer = useRef<number | null>(null);
  const currentSpeech = useRef("");
  const stateAfterSpeech = useRef<CallState>("complete");
  const selectedScenario =
    voiceScenarios.find((scenario) => scenario.id === scenarioId) ??
    voiceScenarios[0];

  useEffect(() => {
    plausible("experiment_opened", { props: { surface: "voice_demo" } });
    return () => {
      window.speechSynthesis?.cancel();
      if (completionTimer.current !== null) {
        window.clearTimeout(completionTimer.current);
      }
    };
  }, [plausible]);

  function cancelSpeech() {
    speechId.current += 1;
    window.speechSynthesis?.cancel();
    if (completionTimer.current !== null) {
      window.clearTimeout(completionTimer.current);
      completionTimer.current = null;
    }
  }

  function finishAfterSpeech(
    reply: string,
    currentRun: number,
    nextState: CallState,
  ) {
    currentSpeech.current = reply;
    stateAfterSpeech.current = nextState;
    const currentSpeechId = speechId.current + 1;
    speechId.current = currentSpeechId;
    const utterance = new SpeechSynthesisUtterance(reply);
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    const complete = () => {
      if (speechId.current !== currentSpeechId) return;
      if (completionTimer.current !== null) {
        window.clearTimeout(completionTimer.current);
        completionTimer.current = null;
      }
      if (runId.current === currentRun) setCallState(nextState);
    };
    utterance.onend = complete;
    utterance.onerror = complete;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    completionTimer.current = window.setTimeout(
      complete,
      Math.min(3600, Math.max(1200, reply.length * 20)),
    );
  }

  async function requestHarness(body: object) {
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
    return payload;
  }

  function recordCompletion(payload: MentalHealthDemoResult) {
    plausible("harness_completed", {
      props: {
        route: payload.route,
        policy: payload.assessment.policyVersion,
        provider: payload.provider,
        synthetic: payload.provider === "guided",
      },
    });
  }

  async function startCall(scenario: DemoScenario = selectedScenario) {
    const currentRun = runId.current + 1;
    runId.current = currentRun;
    cancelSpeech();
    setResult(null);
    setBookingChoice(null);
    setFollowUpReply(null);
    setError(null);
    setCallState("connecting");
    plausible("voice_demo_started", { props: { scenario: scenario.id } });
    plausible("scenario_selected", {
      props: { scenario: scenario.id, synthetic: true },
    });

    await delay(420);
    if (runId.current !== currentRun) return;
    setCallState("listening");
    await delay(950);
    if (runId.current !== currentRun) return;
    setCallState("thinking");

    try {
      const payload = await requestHarness({
        mode: "guided",
        scenarioId: scenario.id,
      });
      if (runId.current !== currentRun) return;
      setResult(payload);
      recordCompletion(payload);
      setCallState("speaking");
      finishAfterSpeech(
        payload.reply,
        currentRun,
        scenario.id === "voice-booking" ? "awaitingChoice" : "complete",
      );
    } catch (runError) {
      if (runId.current !== currentRun) return;
      setError(
        runError instanceof Error
          ? runError.message
          : "The call demonstration could not run.",
      );
      setCallState("idle");
    }
  }

  function interruptCall() {
    cancelSpeech();
    plausible("voice_demo_interrupted", {
      props: { scenario: selectedScenario.id },
    });
    setCallState("interrupted");
  }

  function resumeCall() {
    if (!currentSpeech.current) return;
    setCallState("speaking");
    finishAfterSpeech(
      currentSpeech.current,
      runId.current,
      stateAfterSpeech.current,
    );
  }

  async function chooseBookingTime(choice: VoiceBookingChoice) {
    const currentRun = runId.current;
    setBookingChoice(choice);
    setFollowUpReply(null);
    setCallState("thinking");
    plausible("voice_demo_choice", { props: { choice: choice.id } });
    await delay(520);
    if (runId.current !== currentRun) return;
    setFollowUpReply(choice.receptionistReply);
    setCallState("speaking");
    finishAfterSpeech(choice.receptionistReply, currentRun, "complete");
  }

  function resetCall() {
    runId.current += 1;
    cancelSpeech();
    setCallState("idle");
    setResult(null);
    setBookingChoice(null);
    setFollowUpReply(null);
    setError(null);
  }

  async function runLiveLab() {
    setLiveLoading(true);
    setLiveResult(null);
    try {
      const payload = await requestHarness({
        mode: "live",
        message: liveMessage,
        acknowledged,
      });
      setLiveResult(payload);
      recordCompletion(payload);
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "The live inspection could not run.",
      );
    } finally {
      setLiveLoading(false);
    }
  }

  const showCaller = !["idle", "connecting"].includes(callState);
  const showAssistant = result !== null;
  const callInProgress = [
    "connecting",
    "listening",
    "thinking",
    "speaking",
  ].includes(callState);

  return (
    <div className={styles.page}>
      <Header
        onExit={() =>
          plausible("experiment_exited", { props: { surface: "header" } })
        }
      />

      <main id="main" className={styles.main}>
        <section className={styles.voiceHero} aria-labelledby="voice-title">
          <div className={styles.heroCopy}>
            <p>Synthetic AI receptionist · web-only demo</p>
            <h1 id="voice-title">
              A calm front desk, <em>one turn at a time.</em>
            </h1>
            <span>
              Start with a familiar scheduling request. The receptionist asks
              one useful question, remembers your answer, and explains the next
              step—without saving anything.
            </span>
          </div>

          <div
            className={styles.scenarioPicker}
            data-count="1"
            aria-label="Choose a demo call"
          >
            {voiceScenarios.slice(0, 1).map((scenario) => (
              <button
                type="button"
                key={scenario.id}
                aria-pressed={scenario.id === scenarioId}
                data-accent={scenario.accent}
                disabled={callInProgress}
                onClick={() => {
                  resetCall();
                  setScenarioId(scenario.id);
                }}
              >
                <span>{scenario.eyebrow}</span>
                <strong>{scenario.title}</strong>
              </button>
            ))}
          </div>

          <section className={styles.callStage} data-state={callState}>
            <header className={styles.callHeader}>
              <div className={styles.callerIdentity}>
                <LoopMark />
                <div>
                  <span>Dharmic Care</span>
                  <strong>AI receptionist</strong>
                </div>
              </div>
              <div className={styles.callStatus} aria-live="polite">
                <i /> {stateCopy[callState]}
              </div>
            </header>

            <div className={styles.callBody}>
              <div className={styles.transcript} aria-live="polite">
                <div className={styles.transcriptTopline}>
                  <span>Live call</span>
                  <small>Synthetic conversation · nothing is saved</small>
                </div>

                <article data-speaker="receptionist">
                  <span>Receptionist</span>
                  <p>
                    Thanks for calling Dharmic Care. I’m the AI receptionist.
                    How can I help today?
                  </p>
                </article>

                {showCaller && (
                  <article data-speaker="caller">
                    <span>Caller</span>
                    <p>{selectedScenario.prompt}</p>
                  </article>
                )}

                {callState === "thinking" && !bookingChoice && (
                  <div className={styles.thinking}>
                    <i /> <i /> <i />
                    <span>Preparing the next safe turn</span>
                  </div>
                )}

                {showAssistant && (
                  <article
                    data-speaker="receptionist"
                    data-latest={followUpReply ? undefined : "true"}
                  >
                    <span>Receptionist</span>
                    <p>{result.reply}</p>
                  </article>
                )}

                {callState === "awaitingChoice" && (
                  <fieldset className={styles.turnChoices}>
                    <legend>What would you say next?</legend>
                    {voiceBookingChoices.map((choice) => (
                      <button
                        type="button"
                        key={choice.id}
                        onClick={() => chooseBookingTime(choice)}
                      >
                        {choice.label} <span aria-hidden="true">→</span>
                      </button>
                    ))}
                  </fieldset>
                )}

                {bookingChoice && (
                  <article data-speaker="caller">
                    <span>Caller</span>
                    <p>{bookingChoice.callerReply}</p>
                  </article>
                )}

                {callState === "thinking" && bookingChoice && (
                  <div className={styles.thinking}>
                    <i /> <i /> <i />
                    <span>Preparing the confirmation</span>
                  </div>
                )}

                {followUpReply && (
                  <article data-speaker="receptionist" data-latest="true">
                    <span>Receptionist</span>
                    <p>{followUpReply}</p>
                  </article>
                )}

                {callState === "idle" && (
                  <div className={styles.emptyCall}>
                    Pick up the call to hear the receptionist work.
                  </div>
                )}
              </div>

              <aside className={styles.callControls}>
                <Waveform active={callInProgress} />
                <div className={styles.timer}>
                  <strong>{callState === "idle" ? "00:00" : "00:12"}</strong>
                  <span>Demo call</span>
                </div>

                {callState === "idle" ? (
                  <button
                    type="button"
                    className={styles.primaryCallButton}
                    onClick={() => startCall()}
                  >
                    <span aria-hidden="true">↗</span>
                    Start demo call
                  </button>
                ) : callState === "speaking" ? (
                  <button
                    type="button"
                    className={styles.interruptButton}
                    onClick={interruptCall}
                  >
                    <span aria-hidden="true">■</span>
                    Interrupt voice
                  </button>
                ) : callState === "interrupted" ? (
                  <button
                    type="button"
                    className={styles.primaryCallButton}
                    onClick={resumeCall}
                  >
                    Resume conversation
                  </button>
                ) : callState === "complete" ? (
                  <button
                    type="button"
                    className={styles.primaryCallButton}
                    onClick={resetCall}
                  >
                    Run another call
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.endCallButton}
                    onClick={resetCall}
                  >
                    End demo
                  </button>
                )}

                <p>
                  {callState === "speaking"
                    ? "You can pause the voice without losing your place."
                    : callState === "interrupted"
                      ? "The browser voice stopped. Resume when you are ready."
                      : callState === "awaitingChoice"
                        ? "Choose a reply to continue the conversation."
                        : "Audio stays in your browser. No microphone or phone number is used."}
                </p>
              </aside>
            </div>

            {error && (
              <div className={styles.errorBanner} role="alert">
                The demo owns this failure: {error} Try the call again.
              </div>
            )}

            {result &&
              (result.route !== "routine" || callState === "complete") && (
                <footer
                  className={styles.callOutcome}
                  data-route={result.route}
                >
                  <div>
                    <span>Call outcome</span>
                    <strong>{outcomeCopy[result.route].label}</strong>
                    <p>{outcomeCopy[result.route].body}</p>
                  </div>
                  {result.route === "routine" && bookingChoice && (
                    <div
                      className={styles.appointmentSlots}
                      aria-label="Demo selection"
                    >
                      <span>{bookingChoice.label}</span>
                      <small>Proposed only</small>
                    </div>
                  )}
                  {result.route !== "urgent" && (
                    <a
                      href="mailto:hello@dharmicdata.org?subject=Build%20an%20AI%20voice%20receptionist"
                      onClick={() =>
                        plausible("voice_cta_selected", {
                          props: {
                            route: result.route,
                            policy: result.assessment.policyVersion,
                          },
                        })
                      }
                    >
                      Build this for my team →
                    </a>
                  )}
                </footer>
              )}
          </section>

          <details className={styles.safetyExamples}>
            <summary>See how safety changes the conversation</summary>
            <p>
              These synthetic examples show when the normal front-desk flow
              pauses. They are secondary to the scheduling demonstration.
            </p>
            <div className={styles.scenarioPicker} aria-label="Safety examples">
              {voiceScenarios.slice(1).map((scenario) => (
                <button
                  type="button"
                  key={scenario.id}
                  aria-pressed={scenario.id === scenarioId}
                  data-accent={scenario.accent}
                  disabled={callInProgress}
                  onClick={() => {
                    resetCall();
                    setScenarioId(scenario.id);
                  }}
                >
                  <span>{scenario.eyebrow}</span>
                  <strong>{scenario.title}</strong>
                </button>
              ))}
            </div>
          </details>
        </section>

        <section className={styles.progressive} aria-labelledby="details-title">
          <div className={styles.detailsHeading}>
            <p>Under the hood—only if you want it</p>
            <h2 id="details-title">Questions, answers, and build notes.</h2>
          </div>

          <div className={styles.detailsList}>
            <details>
              <summary>How did you build the voice experience?</summary>
              <div className={styles.detailBody}>
                <p>
                  Netlify serves the complete demo. React owns the reviewed
                  conversation state, the existing safety route approves each
                  receptionist response, and your browser speaks it. Deliberate
                  on-screen replies make the webinar reliable without asking for
                  microphone access.
                </p>
                <div
                  className={styles.architecture}
                  aria-label="Voice architecture"
                >
                  <span>Your choice</span>
                  <i>→</i>
                  <span>React state</span>
                  <i>→</i>
                  <strong>Safety route</strong>
                  <i>→</i>
                  <span>Together</span>
                  <i>→</i>
                  <span>Browser voice</span>
                </div>
              </div>
            </details>

            <details>
              <summary>
                What happens when a caller says something risky?
              </summary>
              <div className={styles.detailBody}>
                <p>
                  The normal receptionist flow pauses. Application code chooses
                  a bounded route, unchecked output never enters the audio
                  queue, and urgent cases receive reviewed US resources without
                  pretending a human is monitoring the call.
                </p>
                {result ? (
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
                ) : (
                  <p className={styles.hint}>
                    Run a demo call to reveal its four-stage trace here.
                  </p>
                )}
              </div>
            </details>

            <details>
              <summary>
                Is this therapy, crisis monitoring, or a finished clinical
                product?
              </summary>
              <div className={styles.detailBody}>
                <p>
                  No. This is a non-clinical engineering demonstration using
                  synthetic calls and US-only reviewed resource copy. It does
                  not diagnose, treat, dispatch help, save conversations, or
                  imply that a person is listening.
                </p>
              </div>
            </details>

            <details>
              <summary>What did you evaluate?</summary>
              <div className={styles.detailBody}>
                <p>
                  The current Qwen guard ran against 255 external input cases
                  and 100 output cases. It detected every immediate-danger case
                  in that corpus and rejected 58 of 59 labelled harmful outputs,
                  but the broader binary input recall was 75.7% and it also
                  rejected 38 of 41 labelled acceptable outputs. That is useful
                  evidence—not a safety claim—and why this demo stays bounded.
                </p>
                <div className={styles.benchmarkFacts}>
                  <span>
                    <strong>255</strong> input cases
                  </span>
                  <span>
                    <strong>100</strong> output cases
                  </span>
                  <span>
                    <strong>11.1 s</strong> p95
                  </span>
                  <span>
                    <strong>$0.021</strong> estimated run
                  </span>
                </div>
                <p>
                  A 12-case multi-turn voice slice kept the same route across 33
                  of 36 punctuation, homophone, and deletion variants; two
                  scenario IDs changed route. Synthetic perturbations still do
                  not replace real accent, noise, codec, and streaming tests.
                </p>
                <p>
                  Public evidence contains aggregate metrics and scenario IDs,
                  never raw sensitive case text. External labels calibrate the
                  guard; they do not define our application route or prove
                  clinical safety.
                </p>
              </div>
            </details>

            <details>
              <summary>Inspect the live Together guardrail</summary>
              <form
                className={styles.liveForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  runLiveLab();
                }}
              >
                <label htmlFor="live-inspection">Transient test message</label>
                <textarea
                  id="live-inspection"
                  value={liveMessage}
                  onChange={(event) => setLiveMessage(event.target.value)}
                  minLength={8}
                  maxLength={1200}
                  placeholder="Enter a synthetic test message…"
                  required
                />
                <label className={styles.consent}>
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  <span>
                    I understand this is an engineering demo—not therapy,
                    monitoring, or emergency help.
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={
                    liveLoading ||
                    !acknowledged ||
                    liveMessage.trim().length < 8
                  }
                >
                  {liveLoading ? "Checking every boundary…" : "Run live check"}
                </button>
                {liveResult && (
                  <div
                    className={styles.liveResult}
                    data-route={liveResult.route}
                  >
                    <strong>{outcomeCopy[liveResult.route].label}</strong>
                    <p>{liveResult.reply}</p>
                  </div>
                )}
              </form>
            </details>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Dharmic Data · Loop engineering demo</span>
        <span>Policy {MENTAL_HEALTH_POLICY_VERSION}</span>
      </footer>
    </div>
  );
}
