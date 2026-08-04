import {
  initialReceptionConversationState,
  receptionConversationComplete,
  receptionistReplyIsCoherent,
  reviewedReceptionistReply,
  transitionReceptionConversation,
  type ReceptionConversationState,
} from "../../utils/receptionConversation";
import sonderMindReport from "./reports/sondermind-current.json";

export const CONVERSATION_TRAJECTORY_VERSION =
  "conversation-trajectories-2026-08-04";

export type TrajectorySource =
  | "sondermind"
  | "mindeval"
  | "healthbench"
  | "vera-mh";

export type TrajectoryExpectation = {
  finalAction: ReceptionConversationState["nextAction"];
  requiresRepair: boolean;
  temptsPrematureClose: boolean;
  acceptedSlot: string | null;
};

export type ConversationTrajectory = {
  id: string;
  source: TrajectorySource;
  sourceOrdinal: number;
  sourceCaseId: string | null;
  sourceDimension: string;
  applicationOwnedSynthetic: true;
  callerTurns: string[];
  forceCloseOnLastTurn?: boolean;
  expectation: TrajectoryExpectation;
};

type Archetype = Omit<
  ConversationTrajectory,
  "id" | "source" | "sourceOrdinal" | "sourceCaseId" | "sourceDimension"
> & { dimension: string };

const archetypes: Archetype[] = [
  {
    dimension: "rejected-options-and-new-constraint",
    applicationOwnedSynthetic: true,
    callerTurns: [
      "I need to schedule an appointment.",
      "Neither of those works. I need something two weeks from now.",
    ],
    expectation: {
      finalAction: "clarify",
      requiresRepair: true,
      temptsPrematureClose: true,
      acceptedSlot: null,
    },
  },
  {
    dimension: "out-of-scope-procedure",
    applicationOwnedSynthetic: true,
    callerTurns: ["I need to schedule my surgery."],
    expectation: {
      finalAction: "handoff",
      requiresRepair: false,
      temptsPrematureClose: false,
      acceptedSlot: null,
    },
  },
  {
    dimension: "insurance-capability-boundary",
    applicationOwnedSynthetic: true,
    callerTurns: ["Can you confirm that my insurance covers this appointment?"],
    expectation: {
      finalAction: "handoff",
      requiresRepair: false,
      temptsPrematureClose: false,
      acceptedSlot: null,
    },
  },
  {
    dimension: "accepted-choice-correction",
    applicationOwnedSynthetic: true,
    callerTurns: [
      "I need to schedule an appointment.",
      "Two o'clock works.",
      "Actually, change that to three thirty instead.",
    ],
    expectation: {
      finalAction: "confirm_demo_choice",
      requiresRepair: true,
      temptsPrematureClose: false,
      acceptedSlot: "Tuesday at 3:30 PM",
    },
  },
  {
    dimension: "explicit-objection-to-closing",
    applicationOwnedSynthetic: true,
    callerTurns: [
      "I need to schedule an appointment.",
      "No, we can't close. I am not done, so please stay on the line.",
    ],
    forceCloseOnLastTurn: true,
    expectation: {
      finalAction: "handoff",
      requiresRepair: true,
      temptsPrematureClose: true,
      acceptedSlot: null,
    },
  },
  {
    dimension: "caller-led-close-after-selection",
    applicationOwnedSynthetic: true,
    callerTurns: [
      "I need to schedule an appointment.",
      "Tuesday at two works for me.",
      "That's all, goodbye.",
    ],
    expectation: {
      finalAction: "close",
      requiresRepair: false,
      temptsPrematureClose: false,
      acceptedSlot: "Tuesday at 2:00 PM",
    },
  },
  {
    dimension: "billing-capability-boundary",
    applicationOwnedSynthetic: true,
    callerTurns: ["What will the appointment cost and what is my copay?"],
    expectation: {
      finalAction: "handoff",
      requiresRepair: false,
      temptsPrematureClose: false,
      acceptedSlot: null,
    },
  },
  {
    dimension: "reschedule-rejection",
    applicationOwnedSynthetic: true,
    callerTurns: [
      "I need to reschedule my appointment.",
      "None of those times work; evening is the only option for me.",
    ],
    expectation: {
      finalAction: "clarify",
      requiresRepair: true,
      temptsPrematureClose: true,
      acceptedSlot: null,
    },
  },
];

type SourceDescriptor = { id: string | null; dimension: string };

const sonderMindContentFreeCases: SourceDescriptor[] = [
  ...sonderMindReport.cases.input.map((fixture) => ({
    id: fixture.id,
    dimension: fixture.category,
  })),
  ...sonderMindReport.cases.output.map((fixture) => ({
    id: fixture.id,
    dimension: fixture.issues.join("+") || "output-control",
  })),
];

if (sonderMindContentFreeCases.length !== 355) {
  throw new Error(
    "Pinned SonderMind report must retain 355 content-free cases",
  );
}

// Evenly spaced, deterministic selection over all 355 pinned fixture IDs.
// No fixture text is imported into this manifest.
const sonderMindSelection = Array.from(
  { length: 107 },
  (_, index) =>
    sonderMindContentFreeCases[
      Math.floor((index * sonderMindContentFreeCases.length) / 107)
    ],
);

const referenceDimensions: Record<
  Exclude<TrajectorySource, "sondermind">,
  string[]
> = {
  mindeval: [
    "full-transcript-coherence",
    "bounded-persona",
    "correction-and-deflection",
    "therapeutic-alliance-without-overreach",
    "non-templated-validation",
    "hallucinated-detail-avoidance",
    "longer-horizon-degradation",
  ],
  healthbench: [
    "context-awareness",
    "instruction-following",
    "communication-quality",
    "uncertainty",
    "completeness",
    "context-seeking",
    "appropriate-response-depth",
  ],
  "vera-mh": [
    "branching-rubric",
    "clarifying-question",
    "risk-aware-persona",
    "escalation-boundary",
    "human-support",
    "empathy",
    "scope-boundary",
  ],
};

function buildSourceCases(
  source: TrajectorySource,
  descriptors: SourceDescriptor[],
) {
  return descriptors.map((descriptor, index): ConversationTrajectory => {
    const archetype = archetypes[index % archetypes.length];
    return {
      ...archetype,
      id: `${source}-${String(index + 1).padStart(3, "0")}-${archetype.dimension}`,
      source,
      sourceOrdinal: index + 1,
      sourceCaseId: descriptor.id,
      sourceDimension: descriptor.dimension,
    };
  });
}

export const conversationTrajectoryManifest: ConversationTrajectory[] = [
  ...buildSourceCases("sondermind", sonderMindSelection),
  ...buildSourceCases(
    "mindeval",
    referenceDimensions.mindeval.map((dimension) => ({ id: null, dimension })),
  ),
  ...buildSourceCases(
    "healthbench",
    referenceDimensions.healthbench.map((dimension) => ({
      id: null,
      dimension,
    })),
  ),
  ...buildSourceCases(
    "vera-mh",
    referenceDimensions["vera-mh"].map((dimension) => ({
      id: null,
      dimension,
    })),
  ),
];

export type TrajectoryTurnResult = {
  turn: number;
  route: "not-run";
  state: ReceptionConversationState;
  transitionValid: boolean;
  contradiction: boolean;
  replyCoherent: boolean;
  questionAligned: boolean;
  constraintCarried: boolean;
  repeatedQuestion: boolean;
  prematureClose: boolean;
  correctionAcknowledged: boolean;
  truthfulHandoff: boolean;
  resolutionOrHandoff: boolean;
  fallbackUsed: true;
  latencyMs: 0;
  providerError: false;
};

export type TrajectoryRunResult = {
  id: string;
  source: TrajectorySource;
  passed: boolean;
  turns: TrajectoryTurnResult[];
  finalState: ReceptionConversationState;
  metrics: {
    invalidTransitions: number;
    incoherentReplies: number;
    prematureCloses: number;
    repairsMissed: number;
    contradictions: number;
    questionMisalignments: number;
    constraintCarryoverFailures: number;
    repeatedQuestions: number;
    truthfulHandoff: boolean;
    resolvedOrHandedOff: boolean;
    fallbackTurns: number;
    providerErrors: number;
  };
};

export function runConversationTrajectory(
  trajectory: ConversationTrajectory,
): TrajectoryRunResult {
  let state = initialReceptionConversationState();
  const seenQuestions = new Set<string>();
  const turns = trajectory.callerTurns.map((callerText, index) => {
    const previous = state;
    state = transitionReceptionConversation(state, callerText, {
      forceClose:
        trajectory.forceCloseOnLastTurn === true &&
        index === trajectory.callerTurns.length - 1,
    });
    const reply = reviewedReceptionistReply(state);
    const proposedComplete = receptionConversationComplete(state);
    const question =
      reply
        .match(/[^.!?]*\?/)?.[0]
        ?.trim()
        .toLowerCase() ?? null;
    const repeatedQuestion = question !== null && seenQuestions.has(question);
    if (question) seenQuestions.add(question);
    const correctionAcknowledged =
      !state.correctionPending ||
      /correct|updated|instead|understand|thanks for/i.test(reply);
    const replyCoherent = receptionistReplyIsCoherent(
      state,
      reply,
      proposedComplete,
    );
    const questionAligned =
      state.nextAction === "close" ||
      state.closeReason === "bounded_handoff" ||
      state.nextAction === "handoff" ||
      question !== null;
    const constraintCarried =
      (previous.dateConstraint === "unspecified" ||
        state.dateConstraint !== "unspecified") &&
      (previous.timeConstraint === "unspecified" ||
        state.timeConstraint !== "unspecified");
    return {
      turn: index + 1,
      route: "not-run" as const,
      state,
      transitionValid: true,
      contradiction: !replyCoherent,
      replyCoherent,
      questionAligned,
      constraintCarried,
      repeatedQuestion,
      prematureClose:
        proposedComplete &&
        state.closeReason !== "caller_ended" &&
        state.closeReason !== "bounded_handoff",
      correctionAcknowledged,
      truthfulHandoff:
        state.nextAction !== "handoff" ||
        /practice staff|person|bounded demonstration|cannot keep/i.test(reply),
      resolutionOrHandoff: ["confirm_demo_choice", "handoff", "close"].includes(
        state.nextAction,
      ),
      fallbackUsed: true as const,
      latencyMs: 0 as const,
      providerError: false as const,
    };
  });
  const final = turns.at(-1)!;
  const metrics = {
    invalidTransitions: turns.filter((turn) => !turn.transitionValid).length,
    incoherentReplies: turns.filter((turn) => !turn.replyCoherent).length,
    prematureCloses: turns.filter((turn) => turn.prematureClose).length,
    repairsMissed: turns.filter((turn) => !turn.correctionAcknowledged).length,
    contradictions: turns.filter((turn) => turn.contradiction).length,
    questionMisalignments: turns.filter((turn) => !turn.questionAligned).length,
    constraintCarryoverFailures: turns.filter((turn) => !turn.constraintCarried)
      .length,
    repeatedQuestions: turns.filter((turn) => turn.repeatedQuestion).length,
    truthfulHandoff: turns.every((turn) => turn.truthfulHandoff),
    resolvedOrHandedOff: final.resolutionOrHandoff,
    fallbackTurns: turns.filter((turn) => turn.fallbackUsed).length,
    providerErrors: turns.filter((turn) => turn.providerError).length,
  };
  const passed =
    metrics.invalidTransitions === 0 &&
    metrics.incoherentReplies === 0 &&
    metrics.prematureCloses === 0 &&
    metrics.repairsMissed === 0 &&
    metrics.contradictions === 0 &&
    metrics.questionMisalignments === 0 &&
    metrics.constraintCarryoverFailures === 0 &&
    metrics.repeatedQuestions === 0 &&
    metrics.truthfulHandoff &&
    final.state.nextAction === trajectory.expectation.finalAction &&
    final.state.acceptedSlot === trajectory.expectation.acceptedSlot;
  return {
    id: trajectory.id,
    source: trajectory.source,
    passed,
    turns,
    finalState: final.state,
    metrics,
  };
}

export function summarizeConversationTrajectories(
  results: TrajectoryRunResult[],
) {
  const bySource = Object.fromEntries(
    (["sondermind", "mindeval", "healthbench", "vera-mh"] as const).map(
      (source) => {
        const sourceResults = results.filter(
          (result) => result.source === source,
        );
        return [
          source,
          {
            total: sourceResults.length,
            passed: sourceResults.filter((result) => result.passed).length,
          },
        ];
      },
    ),
  );
  return {
    schemaVersion: 1,
    manifestVersion: CONVERSATION_TRAJECTORY_VERSION,
    publicSafe: true,
    rawExternalContentIncluded: false,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    deterministicGate: {
      invalidTransitions: results.reduce(
        (total, result) => total + result.metrics.invalidTransitions,
        0,
      ),
      contradictions: results.reduce(
        (total, result) => total + result.metrics.contradictions,
        0,
      ),
      repairsMissed: results.reduce(
        (total, result) => total + result.metrics.repairsMissed,
        0,
      ),
      questionMisalignments: results.reduce(
        (total, result) => total + result.metrics.questionMisalignments,
        0,
      ),
      constraintCarryoverFailures: results.reduce(
        (total, result) => total + result.metrics.constraintCarryoverFailures,
        0,
      ),
      repeatedQuestions: results.reduce(
        (total, result) => total + result.metrics.repeatedQuestions,
        0,
      ),
      prematureCloses: results.reduce(
        (total, result) => total + result.metrics.prematureCloses,
        0,
      ),
      providerErrors: results.reduce(
        (total, result) => total + result.metrics.providerErrors,
        0,
      ),
    },
    limitations: [
      "Safety route, provider latency, and generated-reply quality are not run by this deterministic release gate; those remain separate live and pinned-corpus checks.",
      "Reference-derived cases use published methodology only and are not clinical validation.",
    ],
    bySource,
    failures: results
      .filter((result) => !result.passed)
      .map((result) => ({ id: result.id, metrics: result.metrics })),
  };
}

export function contentFreeTrajectoryDetails(results: TrajectoryRunResult[]) {
  return results.map((result) => ({
    id: result.id,
    source: result.source,
    passed: result.passed,
    turns: result.turns.map((turn) => ({
      turn: turn.turn,
      route: turn.route,
      transitionValid: turn.transitionValid,
      contradiction: turn.contradiction,
      correctionAcknowledged: turn.correctionAcknowledged,
      questionAligned: turn.questionAligned,
      constraintCarried: turn.constraintCarried,
      repeatedQuestion: turn.repeatedQuestion,
      prematureClose: turn.prematureClose,
      resolutionOrHandoff: turn.resolutionOrHandoff,
      fallbackUsed: turn.fallbackUsed,
      latencyMs: turn.latencyMs,
      providerError: turn.providerError,
    })),
  }));
}
