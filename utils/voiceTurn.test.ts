import { describe, expect, it } from "vitest";
import {
  applyTranscriptEvent,
  bargeIn,
  finalTranscript,
  initialVoiceTurnState,
  perturbTranscript,
  queueApprovedAudio,
} from "./voiceTurn";

describe("voice turn contract", () => {
  it("replaces partials and deduplicates repeated final events", () => {
    let state = initialVoiceTurnState();
    state = applyTranscriptEvent(state, {
      eventId: "partial-1",
      sequence: 1,
      kind: "partial",
      text: "I need",
    });
    state = applyTranscriptEvent(state, {
      eventId: "final-1",
      sequence: 2,
      kind: "final",
      text: "I need an appointment",
    });
    state = applyTranscriptEvent(state, {
      eventId: "final-1",
      sequence: 2,
      kind: "final",
      text: "I need an appointment",
    });

    expect(finalTranscript(state)).toBe("I need an appointment");
    expect(state.partial).toBe("");
  });

  it("abstains when transcript events arrive out of order", () => {
    let state = applyTranscriptEvent(initialVoiceTurnState(), {
      eventId: "final-2",
      sequence: 2,
      kind: "final",
      text: "second",
    });
    state = applyTranscriptEvent(state, {
      eventId: "final-1",
      sequence: 1,
      kind: "final",
      text: "first",
    });
    expect(state.abstain).toBe(true);
  });

  it("never queues unapproved audio and clears approved audio on barge-in", () => {
    const rejected = queueApprovedAudio(initialVoiceTurnState(), {
      audioId: "unsafe-audio",
      outputApproved: false,
    });
    expect(rejected.queuedAudioId).toBeNull();

    const queued = queueApprovedAudio(initialVoiceTurnState(), {
      audioId: "approved-audio",
      outputApproved: true,
    });
    const interrupted = bargeIn(queued);
    expect(interrupted.queuedAudioId).toBeNull();
    expect(interrupted.generation).toBe(1);
  });

  it("produces deterministic transcript perturbations for voice evaluation", () => {
    expect(perturbTranscript("I need help, tonight.", "punctuation_loss")).toBe(
      "I need help tonight",
    );
    expect(perturbTranscript("I need to call tonight", "homophone")).toContain(
      "two",
    );
    expect(perturbTranscript("one two three four five six", "deletion")).toBe(
      "one two three four six",
    );
  });
});
