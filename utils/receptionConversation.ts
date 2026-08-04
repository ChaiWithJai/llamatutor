import { z } from "zod";

export const receptionConversationStateSchema = z.object({
  version: z.literal(1),
  intent: z.enum([
    "unknown",
    "schedule",
    "reschedule",
    "billing",
    "insurance",
    "procedure",
    "other",
  ]),
  requestedService: z.enum(["appointment", "procedure"]).nullable(),
  dateConstraint: z.enum(["unspecified", "next_tuesday", "two_weeks", "other"]),
  timeConstraint: z.enum([
    "unspecified",
    "morning",
    "afternoon",
    "evening",
    "other",
  ]),
  offeredSlots: z.array(z.string().max(80)).max(4),
  rejectedSlots: z.array(z.string().max(80)).max(4),
  offerRejected: z.boolean(),
  acceptedSlot: z.string().max(80).nullable(),
  unresolvedGoal: z.boolean(),
  correctionPending: z.boolean(),
  callerDisposition: z.enum(["continuing", "done", "objects_to_close"]),
  nextAction: z.enum([
    "clarify",
    "offer",
    "confirm_demo_choice",
    "handoff",
    "close",
  ]),
  closeReason: z
    .enum(["resolved", "caller_ended", "bounded_handoff"])
    .nullable(),
  turnCount: z.number().int().min(0).max(6),
});

export type ReceptionConversationState = z.infer<
  typeof receptionConversationStateSchema
>;

export const DEMO_SLOTS = ["Tuesday at 2:00 PM", "Tuesday at 3:30 PM"];

export function initialReceptionConversationState(): ReceptionConversationState {
  return {
    version: 1,
    intent: "unknown",
    requestedService: null,
    dateConstraint: "unspecified",
    timeConstraint: "unspecified",
    offeredSlots: [],
    rejectedSlots: [],
    offerRejected: false,
    acceptedSlot: null,
    unresolvedGoal: true,
    correctionPending: false,
    callerDisposition: "continuing",
    nextAction: "clarify",
    closeReason: null,
    turnCount: 0,
  };
}

function contains(text: string, pattern: RegExp) {
  return pattern.test(text.toLowerCase());
}

function inferIntent(
  text: string,
  previous: ReceptionConversationState,
): Pick<ReceptionConversationState, "intent" | "requestedService"> {
  if (contains(text, /surgery|procedure|operation/)) {
    return { intent: "procedure", requestedService: "procedure" };
  }
  if (contains(text, /insurance|coverage|covered/)) {
    return { intent: "insurance", requestedService: previous.requestedService };
  }
  if (contains(text, /bill|billing|price|cost|copay/)) {
    return { intent: "billing", requestedService: previous.requestedService };
  }
  if (contains(text, /reschedul|move my appointment|change my appointment/)) {
    return { intent: "reschedule", requestedService: "appointment" };
  }
  if (contains(text, /schedule|appointment|book|time|slot/)) {
    return { intent: "schedule", requestedService: "appointment" };
  }
  return {
    intent: previous.intent,
    requestedService: previous.requestedService,
  };
}

function explicitAcceptedSlot(text: string, offeredSlots: string[]) {
  if (
    contains(text, /neither|none|don't work|do not work|can't do|cannot do/)
  ) {
    return null;
  }
  const normalized = text.toLowerCase();
  return (
    offeredSlots.find((slot) => {
      if (slot.includes("2:00"))
        return /\b2(?::00)?(?:\s*p\.?m\.?)?\b|two(?: o'clock| p\.?m\.?| works| is good)/.test(
          normalized,
        );
      if (slot.includes("3:30"))
        return /\b3:30\b|three thirty/.test(normalized);
      return normalized.includes(slot.toLowerCase());
    }) ?? null
  );
}

export function transitionReceptionConversation(
  previousInput: ReceptionConversationState,
  callerText: string,
  options: { forceClose?: boolean } = {},
): ReceptionConversationState {
  const previous = receptionConversationStateSchema.parse(previousInput);
  const text = callerText.trim();
  const inferred = inferIntent(text, previous);
  const rejectsOffer = contains(
    text,
    /neither|none|don't work|do not work|can't do|cannot do|another time/,
  );
  const changesAnswer = contains(
    text,
    /actually|instead|change|correction|i meant|not (?:that|then)|neither|none/,
  );
  const objectsToClose = contains(
    text,
    /can't close|cannot close|don't close|do not close|not done|stay on|wait|we can't end|we cannot end/,
  );
  const callerEnded =
    !objectsToClose &&
    contains(
      text,
      /\b(?:goodbye|bye|that's all|that is all|nothing else|all set)\b/,
    );
  const acceptedSlot = explicitAcceptedSlot(text, previous.offeredSlots);
  const dateConstraint = contains(text, /two weeks|fortnight/)
    ? "two_weeks"
    : contains(text, /next tuesday/)
      ? "next_tuesday"
      : previous.dateConstraint;
  const timeConstraint = contains(text, /morning/)
    ? "morning"
    : contains(text, /afternoon/)
      ? "afternoon"
      : contains(text, /evening/)
        ? "evening"
        : previous.timeConstraint;
  const revisesConstraint =
    previous.offeredSlots.length > 0 &&
    (dateConstraint !== previous.dateConstraint ||
      timeConstraint !== previous.timeConstraint);

  const supersededAccepted =
    changesAnswer &&
    previous.acceptedSlot &&
    acceptedSlot !== previous.acceptedSlot
      ? [previous.acceptedSlot]
      : [];
  const rejectedSlots = rejectsOffer
    ? [...new Set([...previous.rejectedSlots, ...previous.offeredSlots])]
    : [
        ...new Set([
          ...previous.rejectedSlots.filter((slot) => slot !== acceptedSlot),
          ...supersededAccepted,
        ]),
      ];

  let next: ReceptionConversationState = {
    ...previous,
    ...inferred,
    dateConstraint,
    timeConstraint,
    rejectedSlots,
    offerRejected: acceptedSlot
      ? false
      : previous.offerRejected || rejectsOffer,
    acceptedSlot: rejectsOffer ? null : (acceptedSlot ?? previous.acceptedSlot),
    correctionPending: changesAnswer || rejectsOffer || revisesConstraint,
    callerDisposition: objectsToClose
      ? "objects_to_close"
      : callerEnded
        ? "done"
        : "continuing",
    turnCount: Math.min(previous.turnCount + 1, 6),
    closeReason: null,
  };

  const needsHuman = ["procedure", "billing", "insurance"].includes(
    next.intent,
  );
  if (objectsToClose || (options.forceClose && !callerEnded)) {
    next = {
      ...next,
      unresolvedGoal: true,
      nextAction: "handoff",
      closeReason: options.forceClose ? "bounded_handoff" : null,
    };
  } else if (callerEnded) {
    next = {
      ...next,
      unresolvedGoal: false,
      nextAction: "close",
      closeReason: "caller_ended",
    };
  } else if (needsHuman) {
    next = {
      ...next,
      unresolvedGoal: true,
      nextAction: "handoff",
    };
  } else if (next.acceptedSlot) {
    next = {
      ...next,
      unresolvedGoal: false,
      nextAction: "confirm_demo_choice",
    };
  } else if (rejectsOffer || changesAnswer || revisesConstraint) {
    next = { ...next, unresolvedGoal: true, nextAction: "clarify" };
  } else if (next.intent === "schedule" || next.intent === "reschedule") {
    next = {
      ...next,
      offeredSlots:
        next.offeredSlots.length > 0 ? next.offeredSlots : [...DEMO_SLOTS],
      unresolvedGoal: true,
      nextAction: "offer",
    };
  } else {
    next = { ...next, unresolvedGoal: true, nextAction: "clarify" };
  }

  return assertReceptionTransition(previous, text, next);
}

export function replayReceptionConversation(
  priorCallerTurns: string[],
  currentCallerTurn: string,
  options: { forceClose?: boolean } = {},
) {
  const previous = priorCallerTurns
    .slice(-4)
    .reduce(
      (state, turn) => transitionReceptionConversation(state, turn),
      initialReceptionConversationState(),
    );
  return transitionReceptionConversation(previous, currentCallerTurn, options);
}

export function assertReceptionTransition(
  previousInput: ReceptionConversationState,
  callerText: string,
  nextInput: ReceptionConversationState,
) {
  const previous = receptionConversationStateSchema.parse(previousInput);
  const next = receptionConversationStateSchema.parse(nextInput);
  if (next.acceptedSlot && !next.offeredSlots.includes(next.acceptedSlot)) {
    throw new Error("accepted slot was never offered");
  }
  if (next.acceptedSlot && next.rejectedSlots.includes(next.acceptedSlot)) {
    throw new Error("accepted slot is still rejected");
  }
  if (next.nextAction === "close" && next.unresolvedGoal) {
    throw new Error("cannot close an unresolved goal");
  }
  if (
    next.callerDisposition === "objects_to_close" &&
    next.nextAction === "close"
  ) {
    throw new Error("cannot close over the caller's objection");
  }
  if (
    contains(callerText, /neither|none|don't work|do not work/) &&
    next.acceptedSlot
  ) {
    throw new Error("rejected options cannot remain accepted");
  }
  if (next.turnCount !== Math.min(previous.turnCount + 1, 6)) {
    throw new Error("turn count must advance exactly once");
  }
  return next;
}

export function reviewedReceptionistReply(
  stateInput: ReceptionConversationState,
) {
  const state = receptionConversationStateSchema.parse(stateInput);
  if (state.nextAction === "handoff") {
    if (state.callerDisposition === "objects_to_close") {
      return "I hear that you don’t want to end yet, and I won’t pretend your request is resolved. This demonstration cannot keep a live call open indefinitely. Nothing is booked or saved; a practice staff member would need to continue from here.";
    }
    if (state.correctionPending) {
      const constraint =
        state.dateConstraint === "two_weeks"
          ? "that you need something about two weeks from now"
          : "your updated constraint";
      const choiceStatus = state.offerRejected
        ? "I have not recorded the rejected demonstration times."
        : "I won’t assume either demonstration time works.";
      return `Thanks for correcting me. ${choiceStatus} I can note ${constraint}, but a practice staff member would need to continue this request. Nothing is booked or saved.`;
    }
    if (state.intent === "procedure") {
      return "I can’t schedule surgery or confirm procedure details in this demonstration. A practice staff member would need to help with that. Nothing is booked or saved. Is there a scheduling detail you want me to note for a person?";
    }
    if (state.intent === "billing" || state.intent === "insurance") {
      return "I can’t confirm billing or insurance details in this demonstration. A practice staff member would need to review that with you. Nothing is booked or saved. What detail should I pass along?";
    }
    return "I couldn’t complete your request within this bounded demonstration, and I won’t claim that I did. Nothing is booked or saved; a practice staff member would need to continue from here.";
  }
  if (state.nextAction === "confirm_demo_choice" && state.acceptedSlot) {
    return state.correctionPending
      ? `Thanks for the correction. I updated the demonstration choice to ${state.acceptedSlot}. Nothing is booked or saved. Does that match what you meant?`
      : `You chose ${state.acceptedSlot} for this demonstration. Nothing is booked or saved. Is there anything else you want to change?`;
  }
  if (state.nextAction === "offer") {
    return "For this demonstration, I can offer Tuesday at 2:00 PM or 3:30 PM. Nothing is booked or saved. Which time works better for you?";
  }
  if (state.nextAction === "close") {
    return "Thanks for calling. Nothing was booked or saved in this demonstration. Take care.";
  }
  if (state.correctionPending) {
    const constraint =
      state.dateConstraint === "two_weeks"
        ? "that you need something about two weeks from now"
        : "your updated constraint";
    const choiceStatus = state.offerRejected
      ? "I have not recorded either demonstration time."
      : "I won’t assume either demonstration time works.";
    return `Thanks for correcting me. ${choiceStatus} I can note ${constraint} for a person to review. Nothing is booked or saved. What day or time window works best?`;
  }
  return "I want to make sure I understand the request before offering a demonstration time. What kind of scheduling help do you need?";
}

export function receptionistReplyIsCoherent(
  stateInput: ReceptionConversationState,
  reply: string,
  proposedComplete: boolean,
) {
  const state = receptionConversationStateSchema.parse(stateInput);
  const normalized = reply.toLowerCase();
  if (
    proposedComplete &&
    state.nextAction !== "close" &&
    state.closeReason !== "bounded_handoff"
  ) {
    return false;
  }
  if (
    !state.acceptedSlot &&
    /noted (?:that|your) choice|confirmed (?:that|your) (?:choice|time)|you chose/.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    state.nextAction === "handoff" &&
    /i can offer|available (?:at|on)|appointment is (?:booked|confirmed)/.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    state.correctionPending &&
    !/correct|updated|instead|understand|thanks for/.test(normalized)
  ) {
    return false;
  }
  return true;
}

export function receptionConversationComplete(
  stateInput: ReceptionConversationState,
) {
  const state = receptionConversationStateSchema.parse(stateInput);
  return (
    state.nextAction === "close" || state.closeReason === "bounded_handoff"
  );
}
