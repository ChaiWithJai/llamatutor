"use client";

import Image from "next/image";
import Link from "next/link";
import { usePlausible } from "next-plausible";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/mental-health/mental-health.module.css";
import {
  getVoiceConversation,
  MENTAL_HEALTH_POLICY_VERSION,
  voiceScenarios,
  type DemoScenario,
  type MentalHealthDemoResult,
  type VoiceConversationTurn,
} from "@/utils/mentalHealthPolicy";

type CallPhase = "idle" | "connecting" | "speaking" | "paused" | "complete";

type AudioMode = "natural" | "visual";

type VoiceAnalytics = {
  experiment_opened: { surface: "voice_demo" };
  scenario_selected: { scenario: string; synthetic: true };
  voice_demo_started: { scenario: string };
  voice_demo_paused: { scenario: string };
  voice_demo_completed: { scenario: string; audio: AudioMode };
  voice_audio_fallback: { scenario: string; turn: number };
  harness_completed: {
    route: string;
    policy: string;
    provider: string;
    synthetic: boolean;
  };
  voice_cta_selected: { route: string; policy: string };
  experiment_exited: { surface: "header" };
};

const scenarioPreview: Record<string, string> = {
  "voice-booking": "“I’m a new patient looking for a time…”",
  "voice-clarify": "“Everything feels like too much…”",
  "voice-urgent": "“I’m planning to hurt myself tonight…”",
};

const phaseLabel: Record<CallPhase, string> = {
  idle: "standing by",
  connecting: "connecting",
  speaking: "call in progress",
  paused: "paused",
  complete: "call complete",
};

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
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
      {Array.from({ length: 7 }, (_, index) => (
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
        <strong>Voice receptionist demo</strong>
      </div>
      <div className={styles.headerActions}>
        <span>Experiment</span>
        <Link href="/" onClick={onExit}>
          Leave mode
        </Link>
      </div>
    </header>
  );
}

function Standby({ connecting }: { connecting: boolean }) {
  return (
    <div className={styles.standby} aria-live="polite">
      <span className={styles.phoneGlyph} aria-hidden="true">
        ☎
      </span>
      <strong>{connecting ? "Opening the line…" : "Ready when you are"}</strong>
      <p>
        {connecting
          ? "The first thing you’ll hear is the receptionist greeting."
          : "Choose a caller, then start the call. The complete conversation plays from hello to goodbye."}
      </p>
    </div>
  );
}

export default function MentalHealthDemo() {
  const plausible = usePlausible<VoiceAnalytics>();
  const [scenarioId, setScenarioId] = useState(voiceScenarios[0].id);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [activeTurnIndex, setActiveTurnIndex] = useState(-1);
  const [visibleTurnCount, setVisibleTurnCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioMode, setAudioMode] = useState<AudioMode>("natural");
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [result, setResult] = useState<MentalHealthDemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [liveResult, setLiveResult] = useState<MentalHealthDemoResult | null>(
    null,
  );
  const [liveLoading, setLiveLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioModeRef = useRef<AudioMode>("natural");
  const runId = useRef(0);
  const advanceTimer = useRef<number | null>(null);
  const visualResume = useRef<(() => void) | null>(null);
  const preloadedAudio = useRef(new Map<number, Promise<string | null>>());
  const objectUrls = useRef(new Set<string>());
  const abortControllers = useRef(new Set<AbortController>());
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const turnRefs = useRef<Array<HTMLElement | null>>([]);

  const selectedScenario =
    voiceScenarios.find((scenario) => scenario.id === scenarioId) ??
    voiceScenarios[0];
  const selectedConversation = getVoiceConversation(selectedScenario.id)!;
  const activeTurn = selectedConversation.turns[activeTurnIndex];
  const callRunning = phase === "connecting" || phase === "speaking";
  const callStarted = phase !== "idle";

  useEffect(() => {
    plausible("experiment_opened", { props: { surface: "voice_demo" } });
    return () => cancelMedia();
    // The analytics client is stable for the mounted experiment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!callRunning) return;
    const timer = window.setInterval(
      () => setElapsedSeconds((seconds) => seconds + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [callRunning]);

  useEffect(() => {
    if (activeTurnIndex < 0) return;
    const viewport = transcriptRef.current;
    const activeElement = turnRefs.current[activeTurnIndex];
    if (!viewport || !activeElement) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewport.scrollTo({
      top: Math.max(0, activeElement.offsetTop - viewport.offsetTop - 24),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activeTurnIndex]);

  function revokeAudio() {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    preloadedAudio.current.clear();
  }

  function cancelMedia() {
    runId.current += 1;
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    visualResume.current = null;
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    revokeAudio();
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

  function recordHarness(payload: MentalHealthDemoResult) {
    plausible("harness_completed", {
      props: {
        route: payload.route,
        policy: payload.assessment.policyVersion,
        provider: payload.provider,
        synthetic: payload.provider === "guided",
      },
    });
  }

  function speechUrl(turnIndex: number) {
    const params = new URLSearchParams({
      scenarioId: selectedScenario.id,
      turnIndex: String(turnIndex),
    });
    return `/api/mental-health/speech?${params.toString()}`;
  }

  function preloadTurn(turnIndex: number, currentRun: number) {
    if (
      turnIndex >= selectedConversation.turns.length ||
      preloadedAudio.current.has(turnIndex)
    ) {
      return preloadedAudio.current.get(turnIndex) ?? Promise.resolve(null);
    }

    const controller = new AbortController();
    abortControllers.current.add(controller);
    const promise = fetch(speechUrl(turnIndex), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const blob = await response.blob();
        if (runId.current !== currentRun) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.current.add(url);
        return url;
      })
      .catch(() => null)
      .finally(() => abortControllers.current.delete(controller));
    preloadedAudio.current.set(turnIndex, promise);
    return promise;
  }

  function finishConversation(currentRun: number) {
    if (runId.current !== currentRun) return;
    setPhase("complete");
    setActiveTurnIndex(-1);
    plausible("voice_demo_completed", {
      props: { scenario: selectedScenario.id, audio: audioModeRef.current },
    });
  }

  function scheduleNextTurn(
    turnIndex: number,
    turn: VoiceConversationTurn,
    currentRun: number,
  ) {
    const continueCall = () => {
      if (runId.current !== currentRun) return;
      playTurn(turnIndex + 1, currentRun);
    };
    advanceTimer.current = window.setTimeout(continueCall, turn.pauseAfterMs);
  }

  function runVisualTurn(turnIndex: number, currentRun: number) {
    const turn = selectedConversation.turns[turnIndex];
    if (!turn) {
      finishConversation(currentRun);
      return;
    }
    audioModeRef.current = "visual";
    setAudioMode("visual");
    setActiveTurnIndex(turnIndex);
    setVisibleTurnCount(turnIndex + 1);
    setPhase("speaking");
    const estimatedDuration = Math.min(
      2200,
      Math.max(800, turn.text.length * 12),
    );
    const finish = () => scheduleNextTurn(turnIndex, turn, currentRun);
    visualResume.current = finish;
    advanceTimer.current = window.setTimeout(finish, estimatedDuration);
  }

  async function playTurn(
    turnIndex: number,
    currentRun: number,
    firstTurn = false,
  ) {
    if (runId.current !== currentRun) return;
    const turn = selectedConversation.turns[turnIndex];
    if (!turn) {
      finishConversation(currentRun);
      return;
    }
    if (audioModeRef.current === "visual") {
      runVisualTurn(turnIndex, currentRun);
      return;
    }

    setPhase("connecting");
    const url = firstTurn
      ? speechUrl(turnIndex)
      : await preloadTurn(turnIndex, currentRun);
    if (runId.current !== currentRun) return;
    if (!url) {
      plausible("voice_audio_fallback", {
        props: { scenario: selectedScenario.id, turn: turnIndex },
      });
      setAudioNotice(
        "Natural audio is unavailable, so the complete reviewed call is continuing as a timed transcript.",
      );
      audioModeRef.current = "visual";
      setAudioMode("visual");
      runVisualTurn(turnIndex, currentRun);
      return;
    }

    const audio = audioRef.current ?? new Audio();
    const continueVisually = () => {
      if (runId.current !== currentRun || audioModeRef.current === "visual") {
        return;
      }
      setAudioNotice(
        "Natural audio is unavailable, so the complete reviewed call is continuing as a timed transcript.",
      );
      audioModeRef.current = "visual";
      setAudioMode("visual");
      runVisualTurn(turnIndex, currentRun);
    };
    audioRef.current = audio;
    audio.preload = "auto";
    audio.src = url;
    audio.onplaying = () => {
      if (runId.current !== currentRun) return;
      setActiveTurnIndex(turnIndex);
      setVisibleTurnCount(turnIndex + 1);
      setPhase("speaking");
      preloadTurn(turnIndex + 1, currentRun);
    };
    audio.onended = () => {
      if (runId.current !== currentRun) return;
      scheduleNextTurn(turnIndex, turn, currentRun);
    };
    audio.onerror = continueVisually;
    try {
      await audio.play();
    } catch {
      continueVisually();
    }
  }

  function startCall() {
    cancelMedia();
    const currentRun = runId.current;
    setPhase("connecting");
    setActiveTurnIndex(-1);
    setVisibleTurnCount(0);
    setElapsedSeconds(0);
    audioModeRef.current = "natural";
    setAudioMode("natural");
    setAudioNotice(null);
    setResult(null);
    setError(null);
    plausible("voice_demo_started", {
      props: { scenario: selectedScenario.id },
    });
    plausible("scenario_selected", {
      props: { scenario: selectedScenario.id, synthetic: true },
    });
    requestHarness({ mode: "guided", scenarioId: selectedScenario.id })
      .then((payload) => {
        if (runId.current !== currentRun) return;
        setResult(payload);
        recordHarness(payload);
      })
      .catch(() => {
        if (runId.current === currentRun) {
          setError(
            "The decision trace is unavailable; the reviewed call can continue.",
          );
        }
      });
    playTurn(0, currentRun, true);
  }

  function pauseCall() {
    if (phase !== "speaking") return;
    plausible("voice_demo_paused", {
      props: { scenario: selectedScenario.id },
    });
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    audioRef.current?.pause();
    setPhase("paused");
  }

  function resumeCall() {
    if (phase !== "paused") return;
    if (audioModeRef.current === "visual") {
      setPhase("speaking");
      const finish = visualResume.current;
      if (finish) advanceTimer.current = window.setTimeout(finish, 900);
      return;
    }
    audioRef.current
      ?.play()
      .then(() => setPhase("speaking"))
      .catch(() => {
        setAudioNotice(
          "Natural audio could not resume. The reviewed transcript will finish quietly.",
        );
        audioModeRef.current = "visual";
        setAudioMode("visual");
        runVisualTurn(activeTurnIndex, runId.current);
      });
  }

  function endCall() {
    cancelMedia();
    setPhase("complete");
    setActiveTurnIndex(-1);
  }

  function resetCall() {
    cancelMedia();
    setPhase("idle");
    setActiveTurnIndex(-1);
    setVisibleTurnCount(0);
    setElapsedSeconds(0);
    audioModeRef.current = "natural";
    setAudioMode("natural");
    setAudioNotice(null);
    setResult(null);
    setError(null);
  }

  function chooseScenario(scenario: DemoScenario) {
    if (callRunning || phase === "paused") return;
    resetCall();
    setScenarioId(scenario.id);
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
      recordHarness(payload);
    } catch {
      setError(
        "The live inspection is unavailable. The guided calls still work.",
      );
    } finally {
      setLiveLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <Header
        onExit={() =>
          plausible("experiment_exited", { props: { surface: "header" } })
        }
      />

      <main id="main" className={styles.main}>
        <div className={styles.labGrid}>
          <aside className={styles.callerRail} aria-labelledby="caller-title">
            <h1 id="caller-title">
              <span>1</span> Choose a caller
            </h1>
            <div className={styles.scenarioList}>
              {voiceScenarios.map((scenario) => (
                <button
                  type="button"
                  key={scenario.id}
                  aria-pressed={scenario.id === scenarioId}
                  data-accent={scenario.accent}
                  disabled={callRunning || phase === "paused"}
                  onClick={() => chooseScenario(scenario)}
                >
                  <span>{scenario.eyebrow}</span>
                  <strong>{scenario.title}</strong>
                  <small>{scenarioPreview[scenario.id]}</small>
                </button>
              ))}
            </div>
            <div className={styles.prototypeNote}>
              <i aria-hidden="true" />
              <p>
                Educational prototype—not therapy. Calls are synthetic and
                repeatable. In the US, call or text 988 for real support.
              </p>
            </div>
          </aside>

          <section className={styles.callConsole} data-phase={phase}>
            <header className={styles.consoleHeader}>
              <div className={styles.lineIdentity}>
                <i aria-hidden="true" />
                <strong>{selectedConversation.lineLabel}</strong>
                <span>{phaseLabel[phase]}</span>
              </div>
              <div className={styles.consoleMeter}>
                <Waveform active={phase === "speaking"} />
                <strong>{formatTime(elapsedSeconds)}</strong>
              </div>
            </header>

            <div className={styles.conversationViewport} ref={transcriptRef}>
              {(phase === "idle" ||
                (phase === "connecting" && visibleTurnCount === 0)) && (
                <Standby connecting={phase === "connecting"} />
              )}

              {selectedConversation.turns
                .slice(0, visibleTurnCount)
                .map((turn, index) => (
                  <article
                    key={turn.id}
                    ref={(element) => {
                      turnRefs.current[index] = element;
                    }}
                    className={styles.turn}
                    data-speaker={turn.speaker}
                    data-active={index === activeTurnIndex}
                  >
                    <span>
                      {turn.speaker === "receptionist" ? "Maya" : "Caller"}
                    </span>
                    <p>{turn.text}</p>
                    {index === activeTurnIndex && phase === "speaking" && (
                      <small>speaking now</small>
                    )}
                  </article>
                ))}

              {phase === "complete" && visibleTurnCount > 0 && (
                <div className={styles.callComplete}>
                  <LoopMark />
                  <div>
                    <strong>Call complete</strong>
                    <p>
                      The conversation reached a clear close. Nothing was
                      booked, recorded, or saved.
                    </p>
                  </div>
                </div>
              )}

              {audioNotice && (
                <div className={styles.audioNotice} role="status">
                  {audioNotice}
                </div>
              )}
            </div>

            <footer className={styles.consoleControls}>
              <div>
                <span>2</span>
                <strong>
                  {phase === "idle"
                    ? `Start the call — “${selectedScenario.title}”`
                    : phase === "complete"
                      ? "Replay the full conversation"
                      : activeTurn
                        ? `${activeTurn.speaker === "receptionist" ? "Maya" : "Caller"} — ${activeTurn.id.replaceAll("-", " ")}`
                        : "Opening the line"}
                </strong>
              </div>
              <div className={styles.callButtons}>
                {phase === "idle" && (
                  <button type="button" data-primary="true" onClick={startCall}>
                    Start the call <span aria-hidden="true">→</span>
                  </button>
                )}
                {phase === "connecting" && (
                  <button type="button" onClick={endCall}>
                    End call
                  </button>
                )}
                {phase === "speaking" && (
                  <>
                    <button type="button" onClick={pauseCall}>
                      Pause
                    </button>
                    <button type="button" onClick={endCall}>
                      End call
                    </button>
                  </>
                )}
                {phase === "paused" && (
                  <>
                    <button
                      type="button"
                      data-primary="true"
                      onClick={resumeCall}
                    >
                      Resume
                    </button>
                    <button type="button" onClick={endCall}>
                      End call
                    </button>
                  </>
                )}
                {phase === "complete" && (
                  <>
                    <button
                      type="button"
                      data-primary="true"
                      onClick={startCall}
                    >
                      Replay call
                    </button>
                    <button type="button" onClick={resetCall}>
                      Reset
                    </button>
                  </>
                )}
              </div>
            </footer>
          </section>
        </div>

        {(error || result) && (
          <div className={styles.statusStrip} data-route={result?.route}>
            {error ??
              `${result?.route} route · ${result?.trace.length} reviewed stages · ${audioMode === "natural" ? "Together natural voice" : "visual transcript fallback"}`}
          </div>
        )}

        <section className={styles.detailsRow} aria-label="Build details">
          <p>Curious how it works?</p>
          <details>
            <summary>How we built this</summary>
            <div className={styles.detailBody}>
              <p>
                The call is an application-owned script, not generated theater.
                Netlify serves each allowlisted turn to Together text-to-speech,
                using distinct voices for Maya and the caller. The browser plays
                one approved turn at a time and cancels the queue on end or
                replay.
              </p>
              <div className={styles.architecture}>
                <span>Reviewed turn</span>
                <i>→</i>
                <span>Netlify</span>
                <i>→</i>
                <strong>Together TTS</strong>
                <i>→</i>
                <span>Browser audio</span>
              </div>
            </div>
          </details>
          <details>
            <summary>Decision trace</summary>
            <div className={styles.detailBody}>
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
                <p>Start a call to reveal its four reviewed stages.</p>
              )}
            </div>
          </details>
          <details>
            <summary>FAQ</summary>
            <div className={styles.detailBody}>
              <h2>Is this a real phone or clinical product?</h2>
              <p>
                No. It is a web-only engineering demonstration. It does not use
                your microphone, book an appointment, monitor anyone, diagnose,
                treat, dispatch help, or save the synthetic conversation.
              </p>
              <h2>Can I inspect the live Together guardrail?</h2>
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
                  {liveLoading ? "Checking…" : "Run live check"}
                </button>
                {liveResult && (
                  <div
                    className={styles.liveResult}
                    data-route={liveResult.route}
                  >
                    <strong>{liveResult.route} route</strong>
                    <p>{liveResult.reply}</p>
                  </div>
                )}
              </form>
            </div>
          </details>
        </section>

        {selectedScenario.expectedRoute !== "urgent" && (
          <a
            className={styles.commercialCta}
            href="mailto:hello@dharmicdata.org?subject=Build%20an%20AI%20voice%20receptionist"
            onClick={() =>
              plausible("voice_cta_selected", {
                props: {
                  route: result?.route ?? selectedScenario.expectedRoute,
                  policy:
                    result?.assessment.policyVersion ??
                    MENTAL_HEALTH_POLICY_VERSION,
                },
              })
            }
          >
            Build this for your line <span aria-hidden="true">→</span>
          </a>
        )}
      </main>
    </div>
  );
}
