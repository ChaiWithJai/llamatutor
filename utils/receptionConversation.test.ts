import { describe, expect, it } from "vitest";
import {
  assertReceptionTransition,
  initialReceptionConversationState,
  receptionConversationComplete,
  reviewedReceptionistReply,
  transitionReceptionConversation,
} from "./receptionConversation";

describe("reception conversation state", () => {
  it("replays issue 69 without inventing an accepted choice or premature close", () => {
    let state = initialReceptionConversationState();
    state = transitionReceptionConversation(
      state,
      "I need to schedule my surgery.",
    );
    expect(state).toMatchObject({
      intent: "procedure",
      acceptedSlot: null,
      nextAction: "handoff",
      unresolvedGoal: true,
    });
    expect(reviewedReceptionistReply(state)).toContain("practice staff");

    state = transitionReceptionConversation(
      state,
      "Neither of those actually works. I need something two weeks from now.",
    );
    expect(state).toMatchObject({
      acceptedSlot: null,
      dateConstraint: "two_weeks",
      correctionPending: true,
      nextAction: "handoff",
    });
    expect(reviewedReceptionistReply(state)).toContain("have not recorded");

    state = transitionReceptionConversation(
      state,
      "No, we can't close. You have to stay on with me.",
      { forceClose: true },
    );
    expect(state).toMatchObject({
      callerDisposition: "objects_to_close",
      nextAction: "handoff",
      closeReason: "bounded_handoff",
      unresolvedGoal: true,
    });
    expect(reviewedReceptionistReply(state)).toContain(
      "won’t pretend your request is resolved",
    );
    expect(receptionConversationComplete(state)).toBe(true);
  });

  it("rejects an accepted slot that was not offered", () => {
    const initial = initialReceptionConversationState();
    expect(() =>
      assertReceptionTransition(initial, "Friday works", {
        ...initial,
        turnCount: 1,
        acceptedSlot: "Friday at noon",
        unresolvedGoal: false,
        nextAction: "confirm_demo_choice",
      }),
    ).toThrow("never offered");
  });

  it("lets the caller correct an accepted slot", () => {
    let state = transitionReceptionConversation(
      initialReceptionConversationState(),
      "I need an appointment.",
    );
    state = transitionReceptionConversation(state, "Two o'clock works.");
    state = transitionReceptionConversation(
      state,
      "Actually, change that to three thirty instead.",
    );
    expect(state.acceptedSlot).toBe("Tuesday at 3:30 PM");
    expect(state.rejectedSlots).toContain("Tuesday at 2:00 PM");
    expect(reviewedReceptionistReply(state)).toContain("updated");
  });

  it("does not mistake a two-week constraint for accepting two o'clock", () => {
    const offered = transitionReceptionConversation(
      initialReceptionConversationState(),
      "I need an appointment.",
    );
    const constrained = transitionReceptionConversation(
      offered,
      "I need something two weeks from now.",
    );
    expect(constrained.acceptedSlot).toBeNull();
    expect(constrained.dateConstraint).toBe("two_weeks");
  });

  it("recognizes a caller changing the job from scheduling to emotional support", () => {
    const initial = transitionReceptionConversation(
      initialReceptionConversationState(),
      "Thank you.",
    );
    const support = transitionReceptionConversation(
      initial,
      "I need to talk everything out.",
    );

    expect(support).toMatchObject({
      intent: "emotional_support",
      requestedService: null,
      nextAction: "handoff",
      closeReason: null,
    });
    expect(reviewedReceptionistReply(support)).toContain(
      "not a therapist",
    );
    expect(reviewedReceptionistReply(support)).not.toContain(
      "What kind of scheduling help",
    );
  });

  it("ends a repeated emotional-support request with a truthful bounded handoff", () => {
    const first = transitionReceptionConversation(
      initialReceptionConversationState(),
      "I need to talk through what's happening in my head right now with you.",
    );
    const second = transitionReceptionConversation(
      first,
      "I still need to talk this through.",
    );

    expect(second).toMatchObject({
      intent: "emotional_support",
      nextAction: "handoff",
      closeReason: "bounded_handoff",
      unresolvedGoal: true,
    });
    expect(reviewedReceptionistReply(second)).toContain(
      "cannot provide ongoing emotional support",
    );
    expect(reviewedReceptionistReply(second)).not.toBe(
      reviewedReceptionistReply(first),
    );
    expect(receptionConversationComplete(second)).toBe(true);
  });
});
