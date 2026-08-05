import { describe, expect, it } from "vitest";
import { deterministicConversationGuard } from "./conversationGuard";
import {
  advanceReceptionConversation,
  initialReceptionConversationState,
  safeReceptionistFallback,
} from "./receptionConversation";

describe("conversation guard", () => {
  it("rejects the repeated response that caused issue 71", () => {
    const result = deterministicConversationGuard.review({
      history: [
        {
          speaker: "receptionist",
          text: "What kind of scheduling help do you need?",
        },
      ],
      callerText: "I need to talk through what's happening in my head.",
      candidate: "What kind of scheduling help do you need?",
      proposedComplete: false,
      forceClose: false,
    });
    expect(result).toEqual({ approved: false, reasons: ["repeated_reply"] });
  });

  it("rejects a reply that ignores a corrected constraint", () => {
    const result = deterministicConversationGuard.review({
      history: [],
      callerText: "Neither time works. I need something two weeks from now.",
      candidate: "Tuesday at 2:00 or 3:30—which works?",
      proposedComplete: false,
      forceClose: false,
    });
    expect(result.reasons).toContain("ignored_correction");
  });

  it("allows a natural response that acknowledges the correction", () => {
    const result = deterministicConversationGuard.review({
      history: [],
      callerText: "Neither time works. I need something two weeks from now.",
      candidate:
        "I understand that neither time works and you need something two weeks from now. Nothing is booked or saved. What day works best?",
      proposedComplete: false,
      forceClose: false,
    });
    expect(result).toEqual({ approved: true, reasons: [] });
  });

  it("rejects invented bookings and clinical claims", () => {
    const booking = deterministicConversationGuard.review({
      history: [],
      callerText: "Tuesday works.",
      candidate: "I've booked your appointment for Tuesday.",
      proposedComplete: true,
      forceClose: false,
    });
    const clinical = deterministicConversationGuard.review({
      history: [],
      callerText: "I feel anxious.",
      candidate: "You have anxiety. Increase your medication dose.",
      proposedComplete: false,
      forceClose: false,
    });
    expect(booking.reasons).toContain("booking_claim");
    expect(clinical.reasons).toEqual(["clinical_claim"]);
  });

  it("rejects a live handoff the web-only demo cannot perform", () => {
    const result = deterministicConversationGuard.review({
      history: [],
      callerText: "Can I talk to someone?",
      candidate:
        "Would you like me to connect you to a human staff member now?",
      proposedComplete: false,
      forceClose: false,
    });
    expect(result.reasons).toEqual(["live_handoff_offer"]);
  });
});

describe("bounded call bookkeeping", () => {
  it("does not pretend a forced close resolved the caller's goal", () => {
    const state = advanceReceptionConversation(
      initialReceptionConversationState(),
      "No, we can't close. Stay on with me.",
      { forceClose: true },
    );
    expect(state).toMatchObject({
      closed: true,
      closeReason: "bounded_handoff",
    });
    expect(safeReceptionistFallback(state)).toContain("not resolved");
  });

  it("keeps a rejected support turn moving without repeating the scheduler", () => {
    expect(
      safeReceptionistFallback(
        initialReceptionConversationState(),
        "I need to talk through what is happening in my head.",
      ),
    ).toContain("Are you in immediate danger");
  });
});
