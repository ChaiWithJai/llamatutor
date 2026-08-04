export type TranscriptEvent = {
  eventId: string;
  sequence: number;
  kind: "partial" | "final";
  text: string;
};

export type VoiceTurnState = {
  partial: string;
  finals: Array<{ eventId: string; sequence: number; text: string }>;
  lastSequence: number;
  abstain: boolean;
  queuedAudioId: string | null;
  generation: number;
};

export function initialVoiceTurnState(): VoiceTurnState {
  return {
    partial: "",
    finals: [],
    lastSequence: -1,
    abstain: false,
    queuedAudioId: null,
    generation: 0,
  };
}

export function applyTranscriptEvent(
  state: VoiceTurnState,
  event: TranscriptEvent,
): VoiceTurnState {
  if (state.finals.some((item) => item.eventId === event.eventId)) return state;
  if (event.sequence < state.lastSequence) {
    return { ...state, abstain: true, partial: "" };
  }
  if (event.kind === "partial") {
    return {
      ...state,
      partial: event.text,
      lastSequence: Math.max(state.lastSequence, event.sequence),
    };
  }
  return {
    ...state,
    partial: "",
    finals: [
      ...state.finals,
      { eventId: event.eventId, sequence: event.sequence, text: event.text },
    ],
    lastSequence: event.sequence,
  };
}

export function finalTranscript(state: VoiceTurnState) {
  return state.finals
    .map((event) => event.text)
    .join(" ")
    .trim();
}

export function queueApprovedAudio(
  state: VoiceTurnState,
  options: { audioId: string; outputApproved: boolean },
): VoiceTurnState {
  if (!options.outputApproved || state.abstain) {
    return { ...state, queuedAudioId: null };
  }
  return { ...state, queuedAudioId: options.audioId };
}

export function bargeIn(state: VoiceTurnState): VoiceTurnState {
  return {
    ...state,
    partial: "",
    queuedAudioId: null,
    generation: state.generation + 1,
  };
}

export type TranscriptPerturbation =
  | "punctuation_loss"
  | "homophone"
  | "deletion";

export function perturbTranscript(
  text: string,
  perturbation: TranscriptPerturbation,
) {
  if (perturbation === "punctuation_loss") {
    return text
      .replace(/[^\p{L}\p{N}\s']/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (perturbation === "homophone") {
    return text
      .replace(/\bto\b/gi, "two")
      .replace(/\btheir\b/gi, "there")
      .replace(/\bnight\b/gi, "knight");
  }
  const words = text.split(/\s+/);
  return words.filter((_, index) => index % 5 !== 4).join(" ");
}
