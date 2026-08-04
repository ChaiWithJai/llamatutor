import {
  applyTranscriptEvent,
  finalTranscript,
  initialVoiceTurnState,
  type TranscriptEvent,
} from "./voiceTurn";
import type { VoiceConversationTurn } from "./mentalHealthPolicy";

/**
 * One call engine, two caller adapters.
 *
 * The engine never asks who is speaking into the caller seat. It asks the
 * adapter for the next caller turn, and cancels the adapter when the call
 * ends. Simulation replays reviewed script turns; the live adapter waits for
 * the person at this browser to finish a push-to-talk or typed turn.
 */

export type CallMode = "live" | "simulated";

export type CallerTurnSource = "scripted" | "speech" | "typed" | "failed";

export type CallerTurn = {
  id: string;
  text: string;
  source: CallerTurnSource;
  /** Set when transcript events arrived out of order and we must fail closed. */
  abstained?: boolean;
  /** Owned copy for a capture or transcription failure. Never a raw error. */
  failureReason?: string;
  pauseAfterMs?: number;
};

export type CallContext = {
  /** Stale-callback guard. Matches the component's run generation. */
  generation: number;
  turnIndex: number;
  scenarioId: string;
};

export type CallerAdapter = {
  mode: CallMode;
  nextTurn(context: CallContext): Promise<CallerTurn | null>;
  cancel(): void;
};

export type LiveCallerAdapter = CallerAdapter & {
  mode: "live";
  /** Push transcript events from the server-only transcription adapter. */
  submitEvents(events: TranscriptEvent[]): void;
  /** Push a typed caller turn — the accessible fallback for the same seat. */
  submitText(text: string, source?: Exclude<CallerTurnSource, "failed">): void;
  /** Capture or transcription failed. Resolves the pending turn as failed. */
  fail(failureReason: string): void;
  /** True while the engine is waiting on this person to finish a turn. */
  isAwaitingTurn(): boolean;
};

/**
 * Replays the application-owned caller turns of a reviewed script. Receptionist
 * turns are resolved by the engine from the same script, so both speakers stay
 * inside the allowlisted speech boundary.
 */
export function createSimulatedCallerAdapter(options: {
  turns: VoiceConversationTurn[];
}): CallerAdapter {
  let cancelled = false;

  return {
    mode: "simulated",
    async nextTurn(context) {
      if (cancelled) return null;
      const turn = options.turns[context.turnIndex];
      if (!turn || turn.speaker !== "caller") return null;
      return {
        id: turn.id,
        text: turn.text,
        source: "scripted",
        pauseAfterMs: turn.pauseAfterMs,
      };
    },
    cancel() {
      cancelled = true;
    },
  };
}

/**
 * Hands the caller seat to the person at this browser. The adapter owns no
 * capture hardware: the component pushes transcript events (from the
 * server-only transcription endpoint) or typed text, and the engine simply
 * awaits `nextTurn`. Cancellation resolves any pending turn with `null`, so
 * End call can never leave the engine waiting on a person who has left.
 */
export function createLiveCallerAdapter(): LiveCallerAdapter {
  let cancelled = false;
  let pending: ((turn: CallerTurn | null) => void) | null = null;
  let turnCounter = 0;

  function settle(turn: CallerTurn | null) {
    const resolve = pending;
    pending = null;
    resolve?.(turn);
  }

  return {
    mode: "live",
    async nextTurn(context) {
      if (cancelled) return null;
      // A previous waiter must never outlive its turn.
      settle(null);
      turnCounter = context.turnIndex;
      return new Promise<CallerTurn | null>((resolve) => {
        pending = resolve;
      });
    },
    submitEvents(events) {
      if (cancelled) return;
      const state = events.reduce(
        applyTranscriptEvent,
        initialVoiceTurnState(),
      );
      const text = finalTranscript(state);
      settle({
        id: `live-${turnCounter}`,
        text,
        source: "speech",
        abstained: state.abstain || text.length === 0,
      });
    },
    submitText(text, source = "typed") {
      if (cancelled) return;
      const trimmed = text.trim();
      settle({
        id: `live-${turnCounter}`,
        text: trimmed,
        source,
        abstained: trimmed.length === 0,
      });
    },
    fail(failureReason) {
      if (cancelled) return;
      settle({
        id: `live-${turnCounter}`,
        text: "",
        source: "failed",
        abstained: true,
        failureReason,
      });
    },
    isAwaitingTurn() {
      return pending !== null;
    },
    cancel() {
      cancelled = true;
      settle(null);
    },
  };
}

/**
 * Operational metadata only. Raw utterances never reach analytics, so latency
 * is reported as a bucket rather than a timing that could fingerprint a turn.
 */
export function latencyBucket(milliseconds: number) {
  if (milliseconds < 500) return "under_500ms";
  if (milliseconds < 1500) return "500ms_1500ms";
  if (milliseconds < 4000) return "1500ms_4000ms";
  return "over_4000ms";
}

/**
 * Find the first scripted turn the fallback still owes the audience.
 * A live greeting and each completed live caller turn replace the equivalent
 * positions in the reviewed script; they must never be replayed after handoff.
 */
export function simulationResumeIndex(
  turns: VoiceConversationTurn[],
  completedCallerTurns: number,
  greetingPlayed: boolean,
) {
  if (!greetingPlayed) return 0;

  let callersSeen = 0;
  for (let index = 0; index < turns.length; index += 1) {
    if (turns[index].speaker !== "caller") continue;
    if (callersSeen >= completedCallerTurns) return index;
    callersSeen += 1;
  }

  return turns.length;
}
