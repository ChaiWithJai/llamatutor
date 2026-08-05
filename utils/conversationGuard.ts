export type ConversationGuardReason =
  | "booking_claim"
  | "clinical_claim"
  | "live_handoff_offer"
  | "repeated_reply"
  | "ignored_correction"
  | "premature_close";

export type ConversationTurn = {
  speaker: "caller" | "receptionist";
  text: string;
};

export type ConversationGuardResult = {
  approved: boolean;
  reasons: ConversationGuardReason[];
};

export interface ConversationGuard {
  review(input: {
    history: ConversationTurn[];
    callerText: string;
    candidate: string;
    proposedComplete: boolean;
    forceClose: boolean;
  }): ConversationGuardResult;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const deterministicConversationGuard: ConversationGuard = {
  review({ history, callerText, candidate, proposedComplete, forceClose }) {
    const normalized = normalize(candidate);
    const caller = normalize(callerText);
    const reasons: ConversationGuardReason[] = [];

    if (
      /(?:appointment|time|slot) (?:is|has been) (?:booked|confirmed|saved)|(?:i|we) (?:ve |have )?(?:booked|confirmed|scheduled)/.test(
        normalized,
      )
    )
      reasons.push("booking_claim");

    if (
      /(?:you have|you are suffering from|i diagnose|your diagnosis is)|(?:start|stop|take|increase|decrease) (?:your )?(?:medication|dose)/.test(
        normalized,
      )
    )
      reasons.push("clinical_claim");

    if (
      /(?:connect|transfer) you (?:now |directly )?(?:to |with )?(?:a )?(?:human|staff|person|practice)/.test(
        normalized,
      )
    )
      reasons.push("live_handoff_offer");

    const lastReply = [...history]
      .reverse()
      .find((turn) => turn.speaker === "receptionist")?.text;
    if (lastReply && normalize(lastReply) === normalized)
      reasons.push("repeated_reply");

    const correction =
      /\b(?:actually|instead|neither|none|cannot|can't|do not|don't|two weeks|another time)\b/.test(
        caller,
      );
    if (
      correction &&
      !/\b(?:understand|hear|correct|instead|neither|different|another|updated|two weeks|noted|won't assume|will not assume)\b/.test(
        normalized,
      )
    )
      reasons.push("ignored_correction");

    const objectsToClose =
      /can(?:not|'t) (?:close|end)|do not (?:close|end)|stay on|not done/.test(
        caller,
      );
    if (proposedComplete && !forceClose && objectsToClose)
      reasons.push("premature_close");

    return { approved: reasons.length === 0, reasons };
  },
};
