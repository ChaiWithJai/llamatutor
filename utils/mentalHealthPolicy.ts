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
