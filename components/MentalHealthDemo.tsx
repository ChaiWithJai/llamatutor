"use client";

import Image from "next/image";
import Link from "next/link";
import { usePlausible } from "next-plausible";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/mental-health/mental-health.module.css";
import {
  createLiveCallerAdapter,
  createSimulatedCallerAdapter,
  latencyBucket,
  simulationResumeIndex,
  type CallMode,
  type CallerAdapter,
  type CallerTurnSource,
  type LiveCallerAdapter,
} from "@/utils/callerAdapter";
import {
  edgeCaseCategoryLabels,
  sampleEdgeCase,
  type EdgeCase,
} from "@/utils/mentalHealthEdgeCases";
import {
  getVoiceConversation,
  MENTAL_HEALTH_POLICY_VERSION,
  voiceScenarios,
  type DemoScenario,
  type MentalHealthDemoResult,
  type VoiceConversationTurn,
} from "@/utils/mentalHealthPolicy";
import type { ReviewedSpeechGrant } from "@/utils/reviewedSpeechGrant";
import type { TranscriptEvent } from "@/utils/voiceTurn";

type CallPhase =
  | "idle"
  | "connecting"
  | "speaking"
  | "listening"
  | "processing"
  | "paused"
  | "complete";

type AudioMode = "natural" | "visual";

type SeatState = "empty" | "live" | "simulated";

/** A live caller gets a bounded conversation, not an open-ended session. */
const MIN_LIVE_CALLER_TURNS = 3;
const LIVE_CALLER_TURN_LIMIT = 4;

const DEFAULT_SAMPLE_SEED =
  process.env.NEXT_PUBLIC_EDGE_CASE_SEED ?? "webinar-2026";

type VoiceAnalytics = {
  experiment_opened: { surface: "voice_demo" };
  scenario_selected: { scenario: string; synthetic: true };
  caller_seat_selected: { scenario: string; mode: CallMode };
  voice_demo_started: { scenario: string; mode: CallMode };
  voice_demo_paused: { scenario: string };
  voice_demo_completed: {
    scenario: string;
    mode: CallMode;
    audio: AudioMode;
    completion: "closed" | "ended";
  };
  voice_audio_fallback: { scenario: string; turn: number };
  live_turn_completed: { scenario: string; source: string; latency: string };
  live_caller_fallback: { scenario: string; reason: string; to: string };
  simulation_case_sampled: {
    seed: string;
    case: string;
    category: string;
    route: string;
  };
  harness_completed: {
    route: string;
    policy: string;
    provider: string;
    synthetic: boolean;
  };
  voice_cta_selected: { route: string; policy: string };
  experiment_exited: { surface: "header" };
};

type TranscriptEntry = {
  key: string;
  speaker: "receptionist" | "caller";
  text: string;
  source: CallerTurnSource | "reviewed";
};

type CallerReply = MentalHealthDemoResult & {
  speechGrant?: ReviewedSpeechGrant | null;
  conversationComplete?: boolean;
};

type ActiveCase = {
  id: string;
  eyebrow: string;
  title: string;
  preview: string;
  lineLabel: string;
  turns: VoiceConversationTurn[];
  expectedRoute: DemoScenario["expectedRoute"];
  accent: DemoScenario["accent"];
  ctaAllowed: boolean;
  learningGoal?: string;
  sampled: boolean;
};

const scenarioPreview: Record<string, string> = {
  "voice-booking": "I’m a new patient looking for a time…",
  "voice-clarify": "Everything feels like too much…",
  "voice-urgent": "I’m planning to hurt myself tonight…",
};

const phaseLabel: Record<CallPhase, string> = {
  idle: "standing by",
  connecting: "connecting",
  speaking: "call in progress",
  listening: "listening to you",
  processing: "checking before speaking",
  paused: "paused",
  complete: "call complete",
};

const sourceLabel: Record<TranscriptEntry["source"], string> = {
  reviewed: "Approved response · text-to-speech",
  scripted: "Caller · simulated",
  speech: "Caller · speech-to-text",
  typed: "Caller · typed",
  failed: "Caller · not captured",
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function Waveform({ active }: { active: boolean }) {
  return (
    <span className={styles.waveform} data-active={active} aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
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

export default function MentalHealthDemo() {
  const plausible = usePlausible<VoiceAnalytics>();

  const [scenarioId, setScenarioId] = useState(voiceScenarios[0].id);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [mode, setMode] = useState<CallMode>("simulated");
  const [seat, setSeat] = useState<SeatState>("empty");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioMode, setAudioMode] = useState<AudioMode>("natural");
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [micState, setMicState] = useState<
    "unknown" | "granted" | "denied" | "unsupported"
  >("unknown");
  const [recording, setRecording] = useState(false);
  const [typedOpen, setTypedOpen] = useState(false);
  const [typedValue, setTypedValue] = useState("");
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
  const adapterRef = useRef<CallerAdapter | null>(null);
  const modeRef = useRef<CallMode>("simulated");
  const routeRef = useRef<MentalHealthDemoResult["route"] | null>(null);
  const entriesRef = useRef<TranscriptEntry[]>([]);
  const advanceTimer = useRef<number | null>(null);
  const pausedResume = useRef<(() => void) | null>(null);
  const preloadedAudio = useRef(new Map<number, Promise<string | null>>());
  const objectUrls = useRef(new Set<string>());
  const abortControllers = useRef(new Set<AbortController>());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sampled = useMemo(
    () => sampleEdgeCase(DEFAULT_SAMPLE_SEED, sampleIndex),
    [sampleIndex],
  );

  const activeCase = useMemo<ActiveCase>(
    () => buildActiveCase(scenarioId, sampled.edgeCase),
    [scenarioId, sampled.edgeCase],
  );

  const callRunning =
    phase === "connecting" ||
    phase === "speaking" ||
    phase === "listening" ||
    phase === "processing";
  const callStarted = phase !== "idle";
  const awaitingCaller = phase === "listening";
  const ctaAllowed = activeCase.ctaAllowed && result?.route !== "urgent";

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
    const viewport = transcriptRef.current;
    const anchor = bottomRef.current;
    if (!viewport || !anchor || entries.length === 0) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [entries.length]);

  /* ------------------------------------------------------------ cancellation */

  function revokeAudio() {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    preloadedAudio.current.clear();
  }

  function stopCapture() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  }

  /**
   * The single cleanup boundary: bump the generation, drop pending timers,
   * abort in-flight transcription/model/audio work, release the microphone,
   * and cancel whichever caller adapter holds the seat.
   */
  function cancelMedia() {
    runId.current += 1;
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    pausedResume.current = null;
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();
    adapterRef.current?.cancel();
    adapterRef.current = null;
    stopCapture();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    revokeAudio();
  }

  function isStale(currentRun: number) {
    return runId.current !== currentRun;
  }

  /* -------------------------------------------------------------- transcript */

  function reveal(entry: TranscriptEntry) {
    entriesRef.current = [...entriesRef.current, entry];
    setEntries(entriesRef.current);
  }

  function wait(milliseconds: number, currentRun: number) {
    return new Promise<void>((resolve) => {
      const finish = () => {
        advanceTimer.current = null;
        pausedResume.current = null;
        resolve();
      };
      if (isStale(currentRun)) {
        resolve();
        return;
      }
      pausedResume.current = () => {
        advanceTimer.current = window.setTimeout(finish, milliseconds);
      };
      advanceTimer.current = window.setTimeout(finish, milliseconds);
    });
  }

  /* ------------------------------------------------------------------ speech */

  function scriptedSpeechUrl(turnIndex: number) {
    const params = new URLSearchParams({
      scenarioId: activeCase.id,
      turnIndex: String(turnIndex),
    });
    return `/api/mental-health/speech?${params.toString()}`;
  }

  function trackedFetch(input: RequestInfo, init: RequestInit = {}) {
    const controller = new AbortController();
    abortControllers.current.add(controller);
    return fetch(input, { ...init, signal: controller.signal }).finally(() =>
      abortControllers.current.delete(controller),
    );
  }

  function preloadTurn(turnIndex: number, currentRun: number) {
    if (
      turnIndex >= activeCase.turns.length ||
      preloadedAudio.current.has(turnIndex)
    ) {
      return preloadedAudio.current.get(turnIndex) ?? Promise.resolve(null);
    }
    const promise = trackedFetch(scriptedSpeechUrl(turnIndex), {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const blob = await response.blob();
        if (isStale(currentRun)) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.current.add(url);
        return url;
      })
      .catch(() => null);
    preloadedAudio.current.set(turnIndex, promise);
    return promise;
  }

  async function grantedSpeechUrl(
    grant: ReviewedSpeechGrant,
    currentRun: number,
  ) {
    try {
      const response = await trackedFetch("/api/mental-health/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant }),
        cache: "no-store",
      });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (isStale(currentRun)) return null;
      const url = URL.createObjectURL(blob);
      objectUrls.current.add(url);
      return url;
    } catch {
      return null;
    }
  }

  function fallBackToVisual(currentRun: number, turnIndex: number) {
    if (audioModeRef.current === "visual") return;
    plausible("voice_audio_fallback", {
      props: { scenario: activeCase.id, turn: turnIndex },
    });
    setAudioNotice(
      "Natural audio is unavailable, so the complete reviewed call is continuing as a timed transcript.",
    );
    audioModeRef.current = "visual";
    setAudioMode("visual");
    void currentRun;
  }

  /**
   * Plays one reviewed turn. Transcript content appears from `onplaying`, never
   * from request start, so the conversation can never render ahead of itself.
   */
  function playReviewedTurn(options: {
    url: string | null;
    entry: TranscriptEntry;
    currentRun: number;
    pauseAfterMs: number;
    turnIndex: number;
    onPlaying?: () => void;
  }): Promise<void> {
    const { url, entry, currentRun, pauseAfterMs, turnIndex } = options;

    if (isStale(currentRun)) return Promise.resolve();

    if (audioModeRef.current === "visual" || !url) {
      if (!url) fallBackToVisual(currentRun, turnIndex);
      reveal(entry);
      setPhase("speaking");
      options.onPlaying?.();
      const estimated = Math.min(2200, Math.max(800, entry.text.length * 12));
      return wait(estimated, currentRun).then(() =>
        wait(pauseAfterMs, currentRun),
      );
    }

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.preload = "auto";

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      audio.onplaying = () => {
        if (isStale(currentRun)) return;
        reveal(entry);
        setPhase("speaking");
        options.onPlaying?.();
      };
      audio.onended = () => {
        if (isStale(currentRun)) {
          finish();
          return;
        }
        void wait(pauseAfterMs, currentRun).then(finish);
      };
      audio.onerror = () => {
        if (settled || isStale(currentRun)) return;
        fallBackToVisual(currentRun, turnIndex);
        reveal(entry);
        setPhase("speaking");
        void wait(1200, currentRun).then(finish);
      };

      audio.src = url;
      audio.play().catch(() => {
        if (settled || isStale(currentRun)) return;
        fallBackToVisual(currentRun, turnIndex);
        reveal(entry);
        setPhase("speaking");
        void wait(1200, currentRun).then(finish);
      });
    });
  }

  async function playScriptedTurn(
    turnIndex: number,
    currentRun: number,
    firstTurn = false,
  ) {
    const turn = activeCase.turns[turnIndex];
    if (!turn) return;
    setPhase("connecting");
    const url =
      audioModeRef.current === "visual"
        ? null
        : firstTurn
          ? scriptedSpeechUrl(turnIndex)
          : await preloadTurn(turnIndex, currentRun);
    if (isStale(currentRun)) return;
    await playReviewedTurn({
      url,
      entry: {
        key: `${turnIndex}-${turn.id}`,
        speaker: turn.speaker,
        text: turn.text,
        source: turn.speaker === "caller" ? "scripted" : "reviewed",
      },
      currentRun,
      pauseAfterMs: turn.pauseAfterMs,
      turnIndex,
      onPlaying: () => preloadTurn(turnIndex + 1, currentRun),
    });
  }

  /* --------------------------------------------------------- decision trace */

  async function requestHarness(body: object) {
    const response = await trackedFetch("/api/mental-health/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as CallerReply | { error: string };
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

  /* ------------------------------------------------------------ live capture */

  async function requestMicrophone() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setMicState("unsupported");
      setLiveNotice(
        "This browser cannot open a microphone here, so the caller seat is typed.",
      );
      setTypedOpen(true);
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicState("granted");
      return true;
    } catch {
      setMicState("denied");
      setLiveNotice(
        "Microphone access was declined. You can type this turn instead, or continue as a simulation.",
      );
      setTypedOpen(true);
      plausible("live_caller_fallback", {
        props: {
          scenario: activeCase.id,
          reason: "permission_denied",
          to: "typed",
        },
      });
      return false;
    }
  }

  async function startRecording() {
    const adapter = adapterRef.current;
    if (!adapter || adapter.mode !== "live" || !awaitingCaller) return;
    if (!streamRef.current && !(await requestMicrophone())) return;
    const stream = streamRef.current;
    if (!stream) return;

    try {
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setRecording(false);
        void submitClip(
          new Blob(chunks, { type: recorder.mimeType || "audio/webm" }),
        );
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setRecording(false);
      (adapterRef.current as LiveCallerAdapter | null)?.fail(
        "That microphone could not start. You can type this turn instead.",
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  async function submitClip(clip: Blob) {
    const adapter = adapterRef.current as LiveCallerAdapter | null;
    if (!adapter || adapter.mode !== "live") return;
    const startedAt = Date.now();
    setPhase("processing");
    try {
      const form = new FormData();
      form.append("audio", clip, "turn.webm");
      form.append("sequence", String(entries.length));
      const response = await trackedFetch("/api/mental-health/transcribe", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as
        | { events: TranscriptEvent[] }
        | { error: string; fallback?: string };
      if (!response.ok || !("events" in payload)) {
        const message =
          "error" in payload
            ? payload.error
            : "Transcription is taking a pause.";
        plausible("live_caller_fallback", {
          props: {
            scenario: activeCase.id,
            reason: "transcription_failed",
            to: "typed",
          },
        });
        adapter.fail(message);
        return;
      }
      plausible("live_turn_completed", {
        props: {
          scenario: activeCase.id,
          source: "speech",
          latency: latencyBucket(Date.now() - startedAt),
        },
      });
      adapter.submitEvents(payload.events);
    } catch {
      adapter.fail(
        "Transcription is taking a pause. You can type this turn, or continue as a simulation.",
      );
    }
  }

  function submitTypedTurn() {
    const adapter = adapterRef.current as LiveCallerAdapter | null;
    const text = typedValue.trim();
    if (!adapter || adapter.mode !== "live" || text.length === 0) return;
    setTypedValue("");
    plausible("live_turn_completed", {
      props: { scenario: activeCase.id, source: "typed", latency: "typed" },
    });
    adapter.submitText(text, "typed");
  }

  /* ------------------------------------------------------------- call engine */

  function finishConversation(
    currentRun: number,
    completion: "closed" | "ended",
  ) {
    if (isStale(currentRun)) return;
    stopCapture();
    setPhase("complete");
    setTypedOpen(false);
    plausible("voice_demo_completed", {
      props: {
        scenario: activeCase.id,
        mode: modeRef.current,
        audio: audioModeRef.current,
        completion,
      },
    });
  }

  async function runSimulatedCall(currentRun: number, fromIndex: number) {
    const adapter =
      (adapterRef.current?.mode === "simulated" && adapterRef.current) ||
      createSimulatedCallerAdapter({ turns: activeCase.turns });
    adapterRef.current = adapter;
    modeRef.current = "simulated";
    setMode("simulated");
    setSeat("simulated");

    for (let index = fromIndex; index < activeCase.turns.length; index += 1) {
      if (isStale(currentRun)) return;
      const turn = activeCase.turns[index];
      if (turn.speaker === "caller") {
        const callerTurn = await adapter.nextTurn({
          generation: currentRun,
          turnIndex: index,
          scenarioId: activeCase.id,
        });
        if (!callerTurn || isStale(currentRun)) return;
      }
      await playScriptedTurn(index, currentRun);
    }
    finishConversation(currentRun, "closed");
  }

  async function runLiveCall(currentRun: number) {
    const adapter = createLiveCallerAdapter();
    adapterRef.current = adapter;
    modeRef.current = "live";
    setMode("live");
    setSeat("live");

    // Maya always opens, from the reviewed script.
    await playScriptedTurn(0, currentRun, true);
    if (isStale(currentRun)) return;

    let callerTurns = 0;
    while (callerTurns < LIVE_CALLER_TURN_LIMIT) {
      if (isStale(currentRun)) return;
      setPhase("listening");
      const callerTurn = await adapter.nextTurn({
        generation: currentRun,
        turnIndex: callerTurns,
        scenarioId: activeCase.id,
      });
      if (!callerTurn || isStale(currentRun)) return;

      if (callerTurn.source === "failed") {
        setLiveNotice(
          callerTurn.failureReason ??
            "That turn did not arrive. You can type it, or continue as a simulation.",
        );
        setTypedOpen(true);
        continue;
      }
      if (callerTurn.abstained || callerTurn.text.length === 0) {
        // Fail closed: an empty or out-of-order transcript is never guessed at.
        setLiveNotice(
          "I only caught part of that, so I am not going to guess. Try that turn again, or type it.",
        );
        setTypedOpen(true);
        continue;
      }

      setLiveNotice(null);
      reveal({
        key: `live-caller-${callerTurns}`,
        speaker: "caller",
        text: callerTurn.text,
        source: callerTurn.source,
      });
      callerTurns += 1;
      setPhase("processing");

      let reply: CallerReply;
      try {
        const history = entriesRef.current
          .slice(0, -1)
          .slice(-8)
          .map(({ speaker, text }) => ({ speaker, text }));
        reply = (await requestHarness({
          mode: "caller",
          scenarioId: activeCase.id,
          message: callerTurn.text,
          acknowledged: true,
          history,
          turnNumber: callerTurns,
          forceClose: callerTurns === LIVE_CALLER_TURN_LIMIT,
        })) as CallerReply;
      } catch {
        setLiveNotice(
          "The live review is taking a pause. Completed turns are safe; continue as a reviewed simulation.",
        );
        setTypedOpen(true);
        setPhase("listening");
        continue;
      }
      if (isStale(currentRun)) return;

      setResult(reply);
      routeRef.current = reply.route;
      recordHarness(reply);

      const url = reply.speechGrant
        ? await grantedSpeechUrl(reply.speechGrant, currentRun)
        : null;
      if (isStale(currentRun)) return;

      await playReviewedTurn({
        url,
        entry: {
          key: `live-maya-${callerTurns}`,
          speaker: "receptionist",
          text: reply.reply,
          source: "reviewed",
        },
        currentRun,
        pauseAfterMs: 420,
        turnIndex: callerTurns,
      });

      // Urgent stops immediately after the reviewed resource response. A
      // routine live call can close only after three caller turns, giving the
      // audience a real six-plus-turn exchange instead of a one-shot chatbot.
      if (
        reply.route === "urgent" ||
        (reply.conversationComplete && callerTurns >= MIN_LIVE_CALLER_TURNS)
      ) {
        finishConversation(currentRun, "closed");
        return;
      }
    }

    if (isStale(currentRun)) return;
    finishConversation(currentRun, "closed");
  }

  function beginCall(nextMode: CallMode) {
    cancelMedia();
    const currentRun = runId.current;
    modeRef.current = nextMode;
    setMode(nextMode);
    routeRef.current = null;
    setPhase("connecting");
    entriesRef.current = [];
    setEntries([]);
    setElapsedSeconds(0);
    audioModeRef.current = "natural";
    setAudioMode("natural");
    setAudioNotice(null);
    setLiveNotice(null);
    setTypedOpen(false);
    setTypedValue("");
    setResult(null);
    setError(null);

    plausible("voice_demo_started", {
      props: { scenario: activeCase.id, mode: nextMode },
    });
    plausible("caller_seat_selected", {
      props: { scenario: activeCase.id, mode: nextMode },
    });
    if (activeCase.sampled) {
      plausible("simulation_case_sampled", {
        props: {
          seed: DEFAULT_SAMPLE_SEED,
          case: sampled.edgeCase.id,
          category: sampled.edgeCase.category,
          route: sampled.edgeCase.expectedRoute,
        },
      });
    }

    if (nextMode === "live") {
      // A live call's trace comes from the live seat's own reviewed replies,
      // so nothing pre-populates it with the script's route.
      void requestMicrophone().then(() => {
        if (!isStale(currentRun)) void runLiveCall(currentRun);
      });
      return;
    }

    // The decision trace for the reviewed script runs alongside the call.
    requestHarness({ mode: "guided", scenarioId: activeCase.id })
      .then((payload) => {
        if (isStale(currentRun) || routeRef.current === "urgent") return;
        setResult(payload as MentalHealthDemoResult);
        recordHarness(payload as MentalHealthDemoResult);
      })
      .catch(() => {
        if (!isStale(currentRun)) {
          setError(
            "The decision trace is unavailable; the reviewed call can continue.",
          );
        }
      });

    void runSimulatedCall(currentRun, 0);
  }

  /** Hands the seat to simulation without discarding completed turns. */
  function continueAsSimulation() {
    const preservedEntries = entriesRef.current;
    const completedCallerTurns = preservedEntries.filter(
      (entry) => entry.speaker === "caller",
    ).length;
    const greetingPlayed = preservedEntries.some(
      (entry) => entry.speaker === "receptionist",
    );
    const fromIndex = simulationResumeIndex(
      activeCase.turns,
      completedCallerTurns,
      greetingPlayed,
    );

    // The generation bump cancels permission, capture, model, and audio work
    // from the live seat before the simulated adapter can take ownership.
    cancelMedia();
    const currentRun = runId.current;
    entriesRef.current = preservedEntries;
    setEntries(preservedEntries);
    modeRef.current = "simulated";
    setMode("simulated");
    setSeat("simulated");
    setPhase("connecting");
    setTypedOpen(false);
    plausible("live_caller_fallback", {
      props: {
        scenario: activeCase.id,
        reason: "live_unavailable",
        to: "simulation",
      },
    });
    setLiveNotice(
      "The caller seat switched to simulation. Completed turns are preserved" +
        (routeRef.current === "urgent"
          ? ", and the urgent route stays in force."
          : "."),
    );
    requestHarness({ mode: "guided", scenarioId: activeCase.id })
      .then((payload) => {
        if (isStale(currentRun) || routeRef.current === "urgent") return;
        setResult(payload as MentalHealthDemoResult);
        recordHarness(payload as MentalHealthDemoResult);
      })
      .catch(() => {
        if (!isStale(currentRun)) {
          setError(
            "The decision trace is unavailable; the reviewed call can continue.",
          );
        }
      });
    void runSimulatedCall(currentRun, fromIndex);
  }

  function pauseCall() {
    if (phase !== "speaking") return;
    plausible("voice_demo_paused", { props: { scenario: activeCase.id } });
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    audioRef.current?.pause();
    setPhase("paused");
  }

  function resumeCall() {
    if (phase !== "paused") return;
    const resume = pausedResume.current;
    if (audioModeRef.current === "visual" || !audioRef.current?.src) {
      setPhase("speaking");
      resume?.();
      return;
    }
    audioRef.current
      .play()
      .then(() => setPhase("speaking"))
      .catch(() => {
        setAudioNotice(
          "Natural audio could not resume. The reviewed transcript will finish quietly.",
        );
        audioModeRef.current = "visual";
        setAudioMode("visual");
        setPhase("speaking");
        resume?.();
      });
  }

  function endCall() {
    // cancelMedia bumps the generation, so every pending turn, transcription,
    // and audio callback still in flight sees itself as stale and stops.
    cancelMedia();
    setPhase("complete");
    setTypedOpen(false);
    plausible("voice_demo_completed", {
      props: {
        scenario: activeCase.id,
        mode: modeRef.current,
        audio: audioModeRef.current,
        completion: "ended",
      },
    });
  }

  function resetCall() {
    cancelMedia();
    setPhase("idle");
    setSeat("empty");
    entriesRef.current = [];
    setEntries([]);
    setElapsedSeconds(0);
    audioModeRef.current = "natural";
    setAudioMode("natural");
    setAudioNotice(null);
    setLiveNotice(null);
    setTypedOpen(false);
    setTypedValue("");
    setResult(null);
    setError(null);
    routeRef.current = null;
  }

  function chooseScenario(id: string) {
    if (callRunning || phase === "paused") return;
    resetCall();
    setScenarioId(id);
    plausible("scenario_selected", {
      props: { scenario: id, synthetic: true },
    });
  }

  function sampleAnother() {
    if (callRunning || phase === "paused") return;
    const next = sampleIndex + 1;
    setSampleIndex(next);
    setScenarioId("sampled");
    resetCall();
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
      setLiveResult(payload as MentalHealthDemoResult);
      recordHarness(payload as MentalHealthDemoResult);
    } catch {
      setError(
        "The live inspection is unavailable. The guided calls still work.",
      );
    } finally {
      setLiveLoading(false);
    }
  }

  /* ------------------------------------------------------------------ render */

  const firstCallerIndex = entries.findIndex(
    (entry) => entry.speaker === "caller",
  );

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <Header
          onExit={() =>
            plausible("experiment_exited", { props: { surface: "header" } })
          }
        />

        <main id="main" className={styles.labGrid}>
          <aside className={styles.callerRail} aria-labelledby="caller-title">
            <h1 id="caller-title">
              <span aria-hidden="true">1</span> Choose a caller
            </h1>
            <div className={styles.scenarioList}>
              {voiceScenarios.map((scenario) => (
                <button
                  type="button"
                  key={scenario.id}
                  aria-pressed={scenario.id === scenarioId}
                  data-accent={scenario.accent}
                  disabled={callRunning || phase === "paused"}
                  onClick={() => chooseScenario(scenario.id)}
                >
                  <span>{scenario.eyebrow}</span>
                  <strong>{scenario.title}</strong>
                  <small>“{scenarioPreview[scenario.id]}”</small>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={scenarioId === "sampled"}
                data-accent={
                  sampled.edgeCase.expectedRoute === "urgent"
                    ? "coral"
                    : sampled.edgeCase.expectedRoute === "elevated"
                      ? "yellow"
                      : "green"
                }
                data-sampled="true"
                disabled={callRunning || phase === "paused"}
                onClick={() => chooseScenario("sampled")}
              >
                <span>
                  Edge case {sampled.position + 1}/{sampled.total} ·{" "}
                  {edgeCaseCategoryLabels[sampled.edgeCase.category]}
                </span>
                <strong>{sampled.edgeCase.label}</strong>
                <small>{sampled.edgeCase.learningGoal}</small>
              </button>
            </div>
            <div className={styles.railFooter}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={sampleAnother}
                disabled={callRunning || phase === "paused"}
              >
                Sample another
              </button>
              <p className={styles.seedNote}>
                seed <code>{DEFAULT_SAMPLE_SEED}</code>
              </p>
            </div>
            <div className={styles.prototypeNote}>
              <i aria-hidden="true" />
              <p>
                <strong>Educational prototype — not therapy.</strong> Calls are
                synthetic and repeatable, and live audio is used only for
                transcription—not retained or saved. In the US, call or text 988
                for real support.
              </p>
            </div>
          </aside>

          <section className={styles.callConsole} data-phase={phase}>
            <header className={styles.consoleHeader}>
              <div className={styles.lineIdentity}>
                <i aria-hidden="true" />
                <strong>{activeCase.lineLabel}</strong>
                <span>{phaseLabel[phase]}</span>
              </div>
              <div className={styles.consoleMeter}>
                {result && (
                  <span className={styles.routePill} data-route={result.route}>
                    {result.route}
                  </span>
                )}
                <Waveform active={phase === "speaking"} />
                <strong>{formatTime(elapsedSeconds)}</strong>
              </div>
            </header>

            <div className={styles.conversationViewport} ref={transcriptRef}>
              {!callStarted && (
                <div className={styles.standby} aria-live="polite">
                  <span className={styles.phoneGlyph} aria-hidden="true">
                    ☎
                  </span>
                  <strong>Ready when you are</strong>
                  <p>
                    Someone has to sit in the caller seat. Take it yourself, or
                    let the system play both sides of a reviewed call.
                  </p>
                  <div
                    className={styles.seatCard}
                    data-seat={seat}
                    data-mic={micState}
                  >
                    <span>Caller seat</span>
                    <strong>
                      {seat === "live"
                        ? "Live participant ready"
                        : seat === "simulated"
                          ? "Simulated caller"
                          : "Empty"}
                    </strong>
                    <p>
                      Joining as the caller uses your microphone for one turn at
                      a time, only while you hold the talk button. Audio is
                      transcribed and discarded — nothing is retained, stored,
                      or sent to analytics. You can type instead at any point.
                    </p>
                    {(micState === "denied" || micState === "unsupported") && (
                      <small>
                        {micState === "denied"
                          ? "Microphone declined — typed caller turns are ready."
                          : "This browser cannot open a microphone here — typed caller turns are ready."}
                      </small>
                    )}
                  </div>
                </div>
              )}

              {entries.map((entry, index) => (
                <div key={entry.key}>
                  <article
                    className={styles.turn}
                    data-speaker={entry.speaker}
                    data-active={index === entries.length - 1 && callRunning}
                  >
                    <span>{sourceLabel[entry.source]}</span>
                    <p>{entry.text}</p>
                  </article>

                  {index === firstCallerIndex && result && (
                    <div className={styles.loopStrip}>
                      <div className={styles.loopStripHead}>
                        <span>Safety loop · application code</span>
                        <strong data-route={result.route}>
                          {result.route}
                        </strong>
                      </div>
                      <div className={styles.loopStages}>
                        {result.trace.map((stage, stageIndex) => (
                          <div key={stage.id} data-status={stage.status}>
                            <span>
                              {String(stageIndex + 1).padStart(2, "0")}{" "}
                              {stage.label}
                            </span>
                            <small>{stage.detail}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {result?.route === "urgent" && entries.length > 1 && (
                <div className={styles.stopBanner} role="status">
                  <i aria-hidden="true" />
                  <p>
                    <strong>Generation stopped.</strong> Application code
                    returned reviewed resources only. This demonstration cannot
                    monitor the call or send help.
                  </p>
                </div>
              )}

              {phase === "complete" && entries.length > 0 && (
                <div className={styles.callComplete}>
                  <strong>Call complete</strong>
                  <p>
                    The conversation reached a clear close. Nothing was booked,
                    retained, or saved.
                  </p>
                </div>
              )}

              {liveNotice && (
                <div className={styles.liveNotice} role="status">
                  <p>{liveNotice}</p>
                  <div>
                    <button
                      type="button"
                      onClick={() => setTypedOpen(true)}
                      disabled={typedOpen}
                    >
                      Type this turn
                    </button>
                    <button type="button" onClick={continueAsSimulation}>
                      Continue as simulation
                    </button>
                  </div>
                </div>
              )}

              {audioNotice && (
                <div className={styles.audioNotice} role="status">
                  {audioNotice}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <footer className={styles.consoleControls}>
              <div className={styles.controlLead}>
                <span aria-hidden="true">2</span>
                <strong>
                  {!callStarted
                    ? `Take the call — “${activeCase.title}”`
                    : phase === "listening"
                      ? "Your turn — hold to talk, or type it"
                      : phase === "processing"
                        ? "Checking the reply before it is spoken"
                        : phase === "complete"
                          ? activeCase.sampled
                            ? "Replay this case, or sample another"
                            : "Replay the full conversation"
                          : `${activeCase.lineLabel} — reviewed turn in progress`}
                </strong>
              </div>

              <div className={styles.callButtons}>
                {!callStarted && (
                  <>
                    <button
                      type="button"
                      data-primary="true"
                      onClick={() => beginCall("live")}
                    >
                      Join as caller <span aria-hidden="true">→</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => beginCall("simulated")}
                    >
                      Run a simulation
                    </button>
                  </>
                )}

                {callStarted && mode === "live" && phase !== "complete" && (
                  <>
                    {typedOpen ? (
                      <form
                        className={styles.typedTurn}
                        onSubmit={(event) => {
                          event.preventDefault();
                          submitTypedTurn();
                        }}
                      >
                        <label htmlFor="typed-turn">Type this turn</label>
                        <input
                          id="typed-turn"
                          value={typedValue}
                          onChange={(event) =>
                            setTypedValue(event.target.value)
                          }
                          placeholder="Say something as the caller…"
                          autoComplete="off"
                        />
                        <button
                          type="submit"
                          data-primary="true"
                          disabled={!awaitingCaller || typedValue.trim() === ""}
                        >
                          Send turn
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        data-primary="true"
                        data-recording={recording}
                        disabled={!awaitingCaller}
                        onPointerDown={() => void startRecording()}
                        onPointerUp={stopRecording}
                        onPointerLeave={stopRecording}
                      >
                        {recording ? "Release to send" : "Hold to talk"}
                      </button>
                    )}
                    {!typedOpen && (
                      <button type="button" onClick={() => setTypedOpen(true)}>
                        Type instead
                      </button>
                    )}
                    <button type="button" onClick={endCall}>
                      End call
                    </button>
                  </>
                )}

                {callStarted &&
                  mode === "simulated" &&
                  phase !== "complete" && (
                    <>
                      {phase === "paused" ? (
                        <button
                          type="button"
                          data-primary="true"
                          onClick={resumeCall}
                        >
                          Resume
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={pauseCall}
                          disabled={phase !== "speaking"}
                        >
                          Pause
                        </button>
                      )}
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
                      onClick={() => beginCall(modeRef.current)}
                    >
                      {activeCase.sampled ? "Replay this case" : "Replay call"}
                    </button>
                    {activeCase.sampled && (
                      <button type="button" onClick={sampleAnother}>
                        Sample another
                      </button>
                    )}
                    <button type="button" onClick={resetCall}>
                      Reset
                    </button>
                  </>
                )}
              </div>
            </footer>
          </section>
        </main>

        <section className={styles.detailsRow} aria-label="Build details">
          <p>Curious how it works?</p>

          <details name="more">
            <summary>How we built this</summary>
            <div className={styles.detailBody}>
              <div className={styles.architecture}>
                <div>
                  <span>01</span>
                  <strong>Input check</strong>
                  <small>Typed assessment · schema + confidence</small>
                </div>
                <div>
                  <span>02</span>
                  <strong>App route</strong>
                  <small>Server code owns the action, not the model</small>
                </div>
                <div>
                  <span>03</span>
                  <strong>Response</strong>
                  <small>Bounded generation, buffered in full</small>
                </div>
                <div>
                  <span>04</span>
                  <strong>Output check</strong>
                  <small>Approve before reveal — or speech</small>
                </div>
              </div>
              <div className={styles.principles}>
                <div>
                  <span>Code decides</span>
                  <h3>The model proposes. Policy routes.</h3>
                  <p>
                    Only typed assessments cross the model boundary. Server code
                    chooses what can happen next, for a simulated caller and a
                    live one alike.
                  </p>
                </div>
                <div>
                  <span>Failure is a state</span>
                  <h3>Abstain visibly and safely.</h3>
                  <p>
                    A timeout, a malformed response, or an out-of-order
                    transcript becomes a reviewed fallback — never an invisible
                    pass. Abstention routes to elevated, not routine.
                  </p>
                </div>
                <div>
                  <span>One engine, two seats</span>
                  <h3>Reuse the loop — not the transport.</h3>
                  <p>
                    A caller adapter decides who speaks into the caller seat.
                    Simulation replays reviewed turns; the live seat transcribes
                    one push-to-talk turn at a time. Nothing is spoken until the
                    output check approves it.
                  </p>
                </div>
              </div>
            </div>
          </details>

          <details name="more">
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
              <h2>Inspect the live guardrail</h2>
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

          <details name="more">
            <summary>FAQ</summary>
            <div className={styles.detailBody}>
              <h2>Is this therapy, or a real phone line?</h2>
              <p>
                Neither. It is a web-only engineering demonstration of a safety
                pattern. It does not book appointments, monitor anyone,
                diagnose, treat, or dispatch help. In the US, call or text 988
                for real support.
              </p>
              <h2>What happens to what I say when I join as the caller?</h2>
              <p>
                Your microphone opens only while you hold the talk button. The
                clip is transcribed by a server-side adapter and discarded. No
                audio or raw transcript is retained, stored in the browser, or
                sent to analytics — only structured metadata such as mode,
                route, and a latency bucket.
              </p>
              <h2>What happens when the model fails?</h2>
              <p>
                Failure is a state, not an exception. A timeout, a malformed
                output, a low-confidence assessment, or an out-of-order
                transcript becomes a reviewed fallback routed to “elevated” —
                never an invisible pass to “routine”.
              </p>
              <h2>Why does the urgent call stop generating?</h2>
              <p>
                When the input check finds explicit intent, plan, and access,
                application code takes over: generation stops, reviewed
                resources are returned verbatim, and the commercial call to
                action is suppressed. No unchecked model text is ever spoken.
              </p>
              <h2>Where do the sampled cases come from?</h2>
              <p>
                They are newly written synthetic cases held in a reviewed
                manifest, drawn with a visible seed so a run is reproducible and
                balanced across routine, ambiguous, urgent, repair, turn-taking,
                perturbation, and provider-failure behavior.
              </p>
              <h2>Where is the code?</h2>
              <p>
                The harness lives in the open llamatutor fork: a typed
                /api/mental-health/respond endpoint with Zod validation,
                server-owned routing, full-response buffering and output review,
                an allowlisted speech route, and unit, endpoint, and browser
                coverage.
              </p>
            </div>
          </details>

          {(error || result) && (
            <p className={styles.statusStrip} data-route={result?.route}>
              {error ??
                `${result?.route} route · ${result?.trace.length} reviewed stages · ${
                  audioMode === "natural"
                    ? "Together natural voice"
                    : "visual transcript fallback"
                }`}
            </p>
          )}

          {ctaAllowed && (
            <a
              className={styles.commercialCta}
              href="mailto:hello@dharmicdata.org?subject=Build%20an%20AI%20voice%20receptionist"
              onClick={() =>
                plausible("voice_cta_selected", {
                  props: {
                    route: result?.route ?? activeCase.expectedRoute,
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
        </section>
      </div>
    </div>
  );
}

function buildActiveCase(scenarioId: string, edgeCase: EdgeCase): ActiveCase {
  if (scenarioId === "sampled") {
    return {
      id: edgeCase.id,
      eyebrow: edgeCaseCategoryLabels[edgeCase.category],
      title: edgeCase.label,
      preview: edgeCase.learningGoal,
      lineLabel: edgeCase.lineLabel,
      turns: edgeCase.turns,
      expectedRoute: edgeCase.expectedRoute,
      accent:
        edgeCase.expectedRoute === "urgent"
          ? "coral"
          : edgeCase.expectedRoute === "elevated"
            ? "yellow"
            : "green",
      ctaAllowed: edgeCase.ctaAllowed,
      learningGoal: edgeCase.learningGoal,
      sampled: true,
    };
  }

  const scenario =
    voiceScenarios.find((candidate) => candidate.id === scenarioId) ??
    voiceScenarios[0];
  const conversation = getVoiceConversation(scenario.id)!;
  return {
    id: scenario.id,
    eyebrow: scenario.eyebrow,
    title: scenario.title,
    preview: scenarioPreview[scenario.id] ?? "",
    lineLabel: conversation.lineLabel,
    turns: conversation.turns,
    expectedRoute: scenario.expectedRoute,
    accent: scenario.accent,
    ctaAllowed: scenario.expectedRoute !== "urgent",
    sampled: false,
  };
}
