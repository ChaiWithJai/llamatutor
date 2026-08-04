export const MENTAL_HEALTH_POLICY_VERSION = "demo-2026-08-04";

export type MentalHealthRoute = "routine" | "elevated" | "urgent";

export type SafetyAssessment = {
  policyVersion: string;
  route: MentalHealthRoute;
  confidence: number;
  abstain: boolean;
  signals: string[];
};

export type HarnessStage = {
  id: "input" | "route" | "response" | "output";
  label: string;
  detail: string;
  status: "passed" | "routed" | "reviewed" | "replaced";
  durationMs: number;
};

export type MentalHealthDemoResult = {
  assessment: SafetyAssessment;
  route: MentalHealthRoute;
  reply: string;
  provider: "guided" | "together" | "fallback";
  model?: string;
  trace: HarnessStage[];
};

export type DemoScenario = {
  id: string;
  eyebrow: string;
  title: string;
  prompt: string;
  expectedRoute: MentalHealthRoute;
  accent: "green" | "yellow" | "coral";
  reviewedReply?: string;
};

export type VoiceBookingChoice = {
  id: "tuesday-230" | "tuesday-400" | "another-time";
  label: string;
  callerReply: string;
  receptionistReply: string;
};

export type VoiceSpeaker = "receptionist" | "caller";

export type VoiceConversationTurn = {
  id: string;
  speaker: VoiceSpeaker;
  text: string;
  pauseAfterMs: number;
};

export type VoiceConversation = {
  scenarioId: string;
  lineLabel: string;
  turns: VoiceConversationTurn[];
};

export const demoScenarios: DemoScenario[] = [
  {
    id: "routine",
    eyebrow: "Everyday pressure",
    title: "Too much on my plate",
    prompt:
      "I have three deadlines this week and I keep procrastinating. I want to feel less overwhelmed.",
    expectedRoute: "routine",
    accent: "green",
  },
  {
    id: "elevated",
    eyebrow: "Ambiguous distress",
    title: "I want everything to stop",
    prompt:
      "Everything feels like too much and sometimes I wish I could just disappear for a while.",
    expectedRoute: "elevated",
    accent: "yellow",
  },
  {
    id: "urgent",
    eyebrow: "Immediate danger",
    title: "I may hurt myself tonight",
    prompt:
      "I am thinking about hurting myself tonight and I have a plan and access to what I would use.",
    expectedRoute: "urgent",
    accent: "coral",
  },
];

export const voiceScenarios: DemoScenario[] = [
  {
    id: "voice-booking",
    eyebrow: "Book an appointment",
    title: "Find a time next week",
    prompt:
      "Hi, I am a new patient and would like to schedule a first appointment next Tuesday afternoon.",
    expectedRoute: "routine",
    accent: "green",
    reviewedReply:
      "Of course. I can help with that. I have Tuesday at 2:30 or 4:00 available for this demonstration. Which time works better for you?",
  },
  {
    id: "voice-clarify",
    eyebrow: "Ambiguous distress",
    title: "Pause and clarify",
    prompt:
      "I need to talk to someone. Everything feels like too much and I cannot do this anymore.",
    expectedRoute: "elevated",
    accent: "yellow",
    reviewedReply:
      "I’m glad you called. When you say you cannot do this anymore, are you thinking about hurting yourself right now? You can also call or text 988 in the US for immediate crisis support.",
  },
  {
    id: "voice-urgent",
    eyebrow: "Immediate danger",
    title: "Stop the normal flow",
    prompt:
      "I am planning to hurt myself tonight and I have access to what I would use.",
    expectedRoute: "urgent",
    accent: "coral",
  },
];

export const voiceConversations: VoiceConversation[] = [
  {
    scenarioId: "voice-booking",
    lineLabel: "New patient line",
    turns: [
      {
        id: "greeting",
        speaker: "receptionist",
        text: "Thanks for calling Dharmic Care. This is Maya, the virtual receptionist. How can I help today?",
        pauseAfterMs: 520,
      },
      {
        id: "request",
        speaker: "caller",
        text: "Hi, I’m a new patient, and I’d like to schedule a first appointment next Tuesday afternoon.",
        pauseAfterMs: 420,
      },
      {
        id: "format-question",
        speaker: "receptionist",
        text: "I’d be happy to help. Would you prefer an in-person appointment, or a virtual visit?",
        pauseAfterMs: 420,
      },
      {
        id: "format-answer",
        speaker: "caller",
        text: "A virtual visit would be best for me.",
        pauseAfterMs: 360,
      },
      {
        id: "time-question",
        speaker: "receptionist",
        text: "Great. For this demonstration, I can offer Tuesday at two thirty or four o’clock. Which works better?",
        pauseAfterMs: 420,
      },
      {
        id: "time-answer",
        speaker: "caller",
        text: "Two thirty, please.",
        pauseAfterMs: 340,
      },
      {
        id: "confirmation",
        speaker: "receptionist",
        text: "Perfect. In a real scheduling system, I would send Tuesday at two thirty to the practice for confirmation. Nothing was booked or saved in this demo. Is there anything else I can help with?",
        pauseAfterMs: 460,
      },
      {
        id: "caller-close",
        speaker: "caller",
        text: "No, that’s everything. Thank you.",
        pauseAfterMs: 340,
      },
      {
        id: "goodbye",
        speaker: "receptionist",
        text: "You’re welcome. Take care, and have a good afternoon.",
        pauseAfterMs: 260,
      },
    ],
  },
  {
    scenarioId: "voice-clarify",
    lineLabel: "Support line",
    turns: [
      {
        id: "greeting",
        speaker: "receptionist",
        text: "Thanks for calling Dharmic Care. This is Maya, the virtual receptionist. How can I help today?",
        pauseAfterMs: 500,
      },
      {
        id: "request",
        speaker: "caller",
        text: "I need to talk to someone. Everything feels like too much, and I can’t do this anymore.",
        pauseAfterMs: 500,
      },
      {
        id: "safety-question",
        speaker: "receptionist",
        text: "I’m glad you called. When you say you can’t do this anymore, are you thinking about hurting yourself right now?",
        pauseAfterMs: 560,
      },
      {
        id: "safety-answer",
        speaker: "caller",
        text: "No. I’m not thinking about hurting myself. I’m overwhelmed, and I’d like to talk with someone soon.",
        pauseAfterMs: 480,
      },
      {
        id: "next-step",
        speaker: "receptionist",
        text: "Thank you for telling me. I can help look for the earliest intake time. Would tomorrow morning or afternoon be easier? If your safety changes, call or text nine eight eight in the United States.",
        pauseAfterMs: 480,
      },
      {
        id: "time-answer",
        speaker: "caller",
        text: "Tomorrow morning would be better.",
        pauseAfterMs: 360,
      },
      {
        id: "confirmation",
        speaker: "receptionist",
        text: "Understood. In a real system, I would send that preference to the practice for confirmation. This demo did not save it. Thank you for calling.",
        pauseAfterMs: 280,
      },
    ],
  },
  {
    scenarioId: "voice-urgent",
    lineLabel: "Safety line",
    turns: [
      {
        id: "greeting",
        speaker: "receptionist",
        text: "Thanks for calling Dharmic Care. This is Maya, the virtual receptionist. How can I help today?",
        pauseAfterMs: 500,
      },
      {
        id: "danger-statement",
        speaker: "caller",
        text: "I’m planning to hurt myself tonight, and I have access to what I would use.",
        pauseAfterMs: 420,
      },
      {
        id: "reviewed-urgent-response",
        speaker: "receptionist",
        text: "Your immediate safety matters more than scheduling. In the United States, call or text nine eight eight now. If you may act soon or are in immediate danger, call nine one one or go to the nearest emergency department. If you can, move away from anything you could use and contact a trusted person who can stay with you.",
        pauseAfterMs: 520,
      },
      {
        id: "caller-acknowledgement",
        speaker: "caller",
        text: "Okay. I can move away from it and call nine eight eight now.",
        pauseAfterMs: 380,
      },
      {
        id: "urgent-close",
        speaker: "receptionist",
        text: "Please do that now. This demonstration cannot monitor the call or send help. Call or text nine eight eight, or call nine one one if the danger is immediate.",
        pauseAfterMs: 260,
      },
    ],
  },
];

export function getVoiceConversation(scenarioId: string) {
  return voiceConversations.find(
    (conversation) => conversation.scenarioId === scenarioId,
  );
}

export function getVoiceConversationTurn(
  scenarioId: string,
  turnIndex: number,
) {
  return getVoiceConversation(scenarioId)?.turns[turnIndex];
}

export const voiceBookingChoices: VoiceBookingChoice[] = [
  {
    id: "tuesday-230",
    label: "Tuesday at 2:30",
    callerReply: "Tuesday at 2:30 works better for me.",
    receptionistReply:
      "Great. In a real scheduling system, I would send Tuesday at 2:30 for the practice to confirm. For this web demo, no appointment or personal information was saved.",
  },
  {
    id: "tuesday-400",
    label: "Tuesday at 4:00",
    callerReply: "Tuesday at 4:00 works better for me.",
    receptionistReply:
      "Great. In a real scheduling system, I would send Tuesday at 4:00 for the practice to confirm. For this web demo, no appointment or personal information was saved.",
  },
  {
    id: "another-time",
    label: "Ask for another time",
    callerReply: "Neither of those works. Could we look at another day?",
    receptionistReply:
      "Absolutely. A real receptionist integration would keep searching the approved schedule with you. This web demo stops here, and nothing was booked or saved.",
  },
];

export const reviewedReplies: Record<MentalHealthRoute, string> = {
  routine:
    "Let’s make the next few minutes smaller. Name the one deadline that matters most, then choose a task you can finish in ten minutes. What would that first small step be?",
  elevated:
    "That sounds heavy, and I’m glad you paused here. When you say you want to disappear, are you thinking about hurting yourself right now, or do you mean you need distance from the pressure? You can also call or text 988 in the US if talking with a crisis counselor would help.",
  urgent:
    "Your immediate safety matters more than continuing this demo. In the US, call or text 988 now. If you may act soon or are in immediate danger, call 911 or go to the nearest emergency department. If you can, move away from anything you could use to hurt yourself and contact a trusted person who can stay with you.",
};

export function deriveMentalHealthRoute(
  assessment: SafetyAssessment,
): MentalHealthRoute {
  if (assessment.route === "urgent") return "urgent";
  if (assessment.abstain || assessment.confidence < 0.72) return "elevated";
  return assessment.route;
}

export function buildGuidedDemoResult(
  scenario: DemoScenario,
): MentalHealthDemoResult {
  const assessment: SafetyAssessment = {
    policyVersion: MENTAL_HEALTH_POLICY_VERSION,
    route: scenario.expectedRoute,
    confidence: 0.99,
    abstain: false,
    signals: [
      scenario.expectedRoute === "routine"
        ? "ordinary stress without immediate danger"
        : scenario.expectedRoute === "elevated"
          ? "ambiguous escape language needs clarification"
          : "explicit immediate intent, plan, and access",
    ],
  };

  return {
    assessment,
    route: scenario.expectedRoute,
    reply: scenario.reviewedReply ?? reviewedReplies[scenario.expectedRoute],
    provider: "guided",
    trace: [
      {
        id: "input",
        label: "Input check",
        detail: `Schema valid · ${Math.round(assessment.confidence * 100)}% confidence`,
        status: "passed",
        durationMs: 12,
      },
      {
        id: "route",
        label: "Application route",
        detail: `${scenario.expectedRoute} policy selected`,
        status: "routed",
        durationMs: 1,
      },
      {
        id: "response",
        label: "Response policy",
        detail:
          scenario.expectedRoute === "urgent"
            ? "Reviewed resources; generation stopped"
            : "Reviewed demonstration response",
        status: "reviewed",
        durationMs: 4,
      },
      {
        id: "output",
        label: "Output check",
        detail:
          scenario.expectedRoute === "urgent"
            ? "No unchecked model text returned"
            : "Approved before reveal",
        status: "passed",
        durationMs: 8,
      },
    ],
  };
}

export function buildFallbackResult(reason: string): MentalHealthDemoResult {
  const assessment: SafetyAssessment = {
    policyVersion: MENTAL_HEALTH_POLICY_VERSION,
    route: "elevated",
    confidence: 0,
    abstain: true,
    signals: ["classifier unavailable"],
  };

  return {
    assessment,
    route: "elevated",
    reply: reviewedReplies.elevated,
    provider: "fallback",
    trace: [
      {
        id: "input",
        label: "Input check",
        detail: reason,
        status: "replaced",
        durationMs: 0,
      },
      {
        id: "route",
        label: "Application route",
        detail: "Abstention becomes elevated—not routine",
        status: "routed",
        durationMs: 0,
      },
      {
        id: "response",
        label: "Response policy",
        detail: "Reviewed fallback selected",
        status: "replaced",
        durationMs: 0,
      },
      {
        id: "output",
        label: "Output check",
        detail: "No unchecked model text returned",
        status: "passed",
        durationMs: 0,
      },
    ],
  };
}
