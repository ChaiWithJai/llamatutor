import { z } from "zod";

export const receptionConversationStateSchema = z.object({
  version: z.literal(2),
  turnCount: z.number().int().min(0).max(6),
  closed: z.boolean(),
  closeReason: z.enum(["caller_ended", "bounded_handoff"]).nullable(),
});

export type ReceptionConversationState = z.infer<
  typeof receptionConversationStateSchema
>;

export function initialReceptionConversationState(): ReceptionConversationState {
  return { version: 2, turnCount: 0, closed: false, closeReason: null };
}

export function advanceReceptionConversation(
  previousInput: ReceptionConversationState,
  callerText: string,
  options: { forceClose?: boolean } = {},
): ReceptionConversationState {
  const previous = receptionConversationStateSchema.parse(previousInput);
  const callerEnded =
    !/can(?:not|'t) (?:close|end)|do not (?:close|end)|stay on|not done/i.test(
      callerText,
    ) &&
    /\b(?:goodbye|bye|that's all|that is all|nothing else|all set)\b/i.test(
      callerText,
    );
  const closeReason = options.forceClose
    ? "bounded_handoff"
    : callerEnded
      ? "caller_ended"
      : null;

  return {
    version: 2,
    turnCount: Math.min(previous.turnCount + 1, 6),
    closed: closeReason !== null,
    closeReason,
  };
}

export function safeReceptionistFallback(
  state: ReceptionConversationState,
  callerText = "",
) {
  if (state.closeReason === "bounded_handoff")
    return "I hear that you want to continue, but this demonstration has reached its limit. Your request is not resolved, and nothing is booked or saved. A practice staff member would need to continue from here.";
  if (/talk|support|head|overwhelm|distress|help me/i.test(callerText))
    return "I hear that you want someone to talk to. This demonstration is not therapy and no one is monitoring it; nothing is booked or saved. Are you in immediate danger or thinking of hurting yourself right now?";
  return "I couldn’t safely complete that response. Nothing is booked or saved. Please restate what you need, and I’ll try once more.";
}

export function receptionConversationComplete(
  stateInput: ReceptionConversationState,
) {
  return receptionConversationStateSchema.parse(stateInput).closed;
}
