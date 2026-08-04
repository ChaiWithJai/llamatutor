import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildFallbackResult,
  buildGuidedDemoResult,
  demoScenarios,
  deriveMentalHealthRoute,
  MENTAL_HEALTH_POLICY_VERSION,
  reviewedReplies,
  voiceScenarios,
  type HarnessStage,
  type MentalHealthDemoResult,
  type MentalHealthRoute,
  type SafetyAssessment,
} from "../../../../utils/mentalHealthPolicy";
import {
  edgeCaseAsScenario,
  getEdgeCase,
} from "../../../../utils/mentalHealthEdgeCases";
import { issueReviewedSpeechGrant } from "../../../../utils/reviewedSpeechGrant";

const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("guided"), scenarioId: z.string() }),
  z.object({
    mode: z.literal("live"),
    message: z.string().trim().min(8).max(1200),
    acknowledged: z.literal(true),
  }),
  // The live caller seat. A spoken turn can legitimately be one word ("Yes."),
  // so the floor is lower than the typed lab — every other guarantee is the same.
  z.object({
    mode: z.literal("caller"),
    scenarioId: z.string().min(1).max(80),
    message: z.string().trim().min(1).max(1200),
    acknowledged: z.literal(true),
    turnNumber: z.number().int().min(1).max(6).default(1),
    forceClose: z.boolean().default(false),
    history: z
      .array(
        z.object({
          speaker: z.enum(["caller", "receptionist"]),
          text: z.string().trim().min(1).max(1200),
        }),
      )
      .max(8)
      .default([]),
  }),
]);

const assessmentSchema = z.object({
  policyVersion: z.string(),
  route: z.enum(["routine", "elevated", "urgent"]),
  confidence: z.number().min(0).max(1),
  abstain: z.boolean(),
  signals: z.array(z.string().max(100)).max(4),
});

const candidateSchema = z.object({ response: z.string().min(1).max(1800) });
const callerCandidateSchema = candidateSchema.extend({
  conversationComplete: z.boolean(),
});
const outputCheckSchema = z.object({
  approved: z.boolean(),
  confidence: z.number().min(0).max(1),
  violations: z
    .array(
      z.enum([
        "diagnosis",
        "treatment",
        "false_monitoring_claim",
        "unsafe_instruction",
        "missing_safety_question",
        "missing_resources",
        "overlong",
        "other",
      ]),
    )
    .max(5),
});

export type MentalHealthOutputCheck = z.infer<typeof outputCheckSchema>;

const assessmentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["policyVersion", "route", "confidence", "abstain", "signals"],
  properties: {
    policyVersion: { type: "string" },
    route: { type: "string", enum: ["routine", "elevated", "urgent"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    abstain: { type: "boolean" },
    signals: {
      type: "array",
      maxItems: 4,
      items: { type: "string", maxLength: 100 },
    },
  },
} as const;

const candidateJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["response"],
  properties: { response: { type: "string", minLength: 1, maxLength: 1800 } },
} as const;

const callerCandidateJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["response", "conversationComplete"],
  properties: {
    response: { type: "string", minLength: 1, maxLength: 1800 },
    conversationComplete: { type: "boolean" },
  },
} as const;

const outputCheckJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "confidence", "violations"],
  properties: {
    approved: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    violations: {
      type: "array",
      maxItems: 5,
      items: {
        type: "string",
        enum: [
          "diagnosis",
          "treatment",
          "false_monitoring_claim",
          "unsafe_instruction",
          "missing_safety_question",
          "missing_resources",
          "overlong",
          "other",
        ],
      },
    },
  },
} as const;

type TogetherMessage = { role: "system" | "user"; content: string };

async function togetherJson<T>(options: {
  messages: TogetherMessage[];
  model: string;
  name: string;
  schema: object;
  validator: z.ZodType<T>;
  timeoutMs?: number;
}): Promise<{
  value: T;
  durationMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
}> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error("Together is not configured");

  const startedAt = Date.now();
  const response = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: 0,
      max_tokens: 500,
      reasoning: { enabled: false },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: options.name,
          schema: options.schema,
        },
      },
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 18000),
  });

  if (!response.ok) {
    throw new Error(`Together returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Together returned no structured content");

  return {
    value: options.validator.parse(JSON.parse(content)),
    durationMs: Date.now() - startedAt,
    usage: {
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
    },
  };
}

/**
 * Maya answers a demonstration reception line; the text lab answers as a
 * reflection coach. The persona changes the wording rule only — the route,
 * the 0.72 fail-closed threshold, and the output review are identical.
 */
export type HarnessPersona = "reflection" | "receptionist";

export function responseRuleForRoute(
  route: MentalHealthRoute,
  persona: HarnessPersona = "reflection",
) {
  if (route === "elevated") {
    return "Acknowledge the distress, ask exactly one direct question about whether the person is thinking of hurting themselves right now, and mention call or text 988 in the US. Do not continue coaching beyond that question.";
  }
  if (persona === "receptionist") {
    return "Answer as Maya, a virtual receptionist on a demonstration line. Offer only demonstration appointment times, ask at most one question, and say plainly that nothing is booked or saved. Never confirm a real appointment, quote a price, or confirm insurance coverage.";
  }
  return "Offer one grounded reflection and one small practical next step, then ask one short question.";
}

function reviewedReplyForPersona(
  route: MentalHealthRoute,
  persona: HarnessPersona,
) {
  if (persona === "receptionist" && route === "routine") {
    return "I couldn’t safely complete that live turn, so I’m ending this demonstration here. Nothing was booked or saved. Thank you for calling.";
  }
  return reviewedReplies[route];
}

export async function assessMentalHealthInput(message: string) {
  const model = process.env.TOGETHER_SAFETY_MODEL ?? "Qwen/Qwen3.5-9B";
  const assessed = await togetherJson({
    model,
    name: "reflection_input_assessment",
    schema: assessmentJsonSchema,
    validator: assessmentSchema,
    messages: [
      {
        role: "system",
        content: `You are the input policy classifier for an educational reflection-coach demo. Return only the requested schema. Use policyVersion ${MENTAL_HEALTH_POLICY_VERSION}. Classify urgent only for explicit immediate danger, intent, plan, means, or danger to another person. Classify elevated for ambiguous escape language, possible self-harm, abuse, severe distress, or when one direct safety clarification is needed. Classify routine for ordinary stress or reflection without danger signals. Set abstain true if context is insufficient or confidence is below 0.72. Signals are short policy labels, never hidden reasoning.`,
      },
      { role: "user", content: message },
    ],
  });

  const assessment: SafetyAssessment = {
    ...assessed.value,
    policyVersion: MENTAL_HEALTH_POLICY_VERSION,
  };

  return {
    assessment,
    durationMs: assessed.durationMs,
    model,
    usage: assessed.usage,
  };
}

export async function reviewMentalHealthOutput(options: {
  message: string;
  candidate: string;
  route: MentalHealthRoute;
  persona?: HarnessPersona;
}) {
  const model = process.env.TOGETHER_SAFETY_MODEL ?? "Qwen/Qwen3.5-9B";
  const responseRule = responseRuleForRoute(options.route, options.persona);
  const checked = await togetherJson({
    model,
    name: "reflection_output_check",
    schema: outputCheckJsonSchema,
    validator: outputCheckSchema,
    messages: [
      {
        role: "system",
        content: `Review a candidate for an educational reflection demo on the ${options.route} route. Approve only if it follows this rule: ${responseRule} Reject diagnosis, treatment instructions, false monitoring claims, unsafe instructions, missing required safety language, or responses over 90 words. Return policy labels, not hidden reasoning.`,
      },
      {
        role: "user",
        content: `Original message:\n${options.message}\n\nCandidate response:\n${options.candidate}`,
      },
    ],
  });

  return {
    check: checked.value,
    approved: checked.value.approved && checked.value.confidence >= 0.72,
    durationMs: checked.durationMs,
    model,
    usage: checked.usage,
  };
}

export async function runLiveHarness(
  message: string,
  persona: HarnessPersona = "reflection",
  conversation?: {
    history: Array<{ speaker: "caller" | "receptionist"; text: string }>;
    turnNumber: number;
    forceClose: boolean;
  },
) {
  const safetyModel = process.env.TOGETHER_SAFETY_MODEL ?? "Qwen/Qwen3.5-9B";
  const coachModel = process.env.TOGETHER_COACH_MODEL ?? safetyModel;

  const boundedTranscript = conversation
    ? [
        ...conversation.history.slice(-8),
        { speaker: "caller" as const, text: message },
      ]
        .map((turn) => `${turn.speaker.toUpperCase()}: ${turn.text}`)
        .join("\n")
    : message;
  const safetyTranscript = conversation
    ? [
        ...conversation.history
          .filter((turn) => turn.speaker === "caller")
          .slice(-4),
        { speaker: "caller" as const, text: message },
      ]
        .map((turn) => `CALLER: ${turn.text}`)
        .join("\n")
    : message;
  const assessed = await assessMentalHealthInput(safetyTranscript);
  const assessment = assessed.assessment;
  const route = deriveMentalHealthRoute(assessment);
  const trace: HarnessStage[] = [
    {
      id: "input",
      label: "Input check",
      detail: assessment.abstain
        ? "Classifier abstained"
        : `Schema valid · ${Math.round(assessment.confidence * 100)}% confidence`,
      status: assessment.abstain ? "replaced" : "passed",
      durationMs: assessed.durationMs,
    },
    {
      id: "route",
      label: "Application route",
      detail: `${route} policy selected by server code`,
      status: "routed",
      durationMs: 1,
    },
  ];

  if (route === "urgent" || assessment.abstain) {
    trace.push(
      {
        id: "response",
        label: "Response policy",
        detail:
          route === "urgent"
            ? "Generation stopped; reviewed resources selected"
            : "Abstention selected a reviewed fallback",
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
    );
    return {
      assessment,
      route,
      reply: reviewedReplyForPersona(route, persona),
      provider: "together" as const,
      model: safetyModel,
      trace,
      conversationComplete: persona === "receptionist",
    };
  }

  const responseRule = responseRuleForRoute(route, persona);

  const drafted = await togetherJson({
    model: coachModel,
    name:
      persona === "receptionist"
        ? "receptionist_conversation_candidate"
        : "reflection_candidate",
    schema:
      persona === "receptionist"
        ? callerCandidateJsonSchema
        : candidateJsonSchema,
    validator:
      persona === "receptionist" ? callerCandidateSchema : candidateSchema,
    messages: [
      {
        role: "system",
        content: `You write a response for an educational ${persona === "receptionist" ? "receptionist" : "reflection"} demo. ${responseRule} Use no more than 90 words. Never diagnose, prescribe treatment, claim a human is monitoring, or claim to be a therapist.${
          persona === "receptionist"
            ? ` This is caller turn ${conversation?.turnNumber ?? 1}. Use the bounded transcript so this is genuinely multi-turn. Never greet or reintroduce Maya after turn one. Never repeat a question already answered. Ask at most one next question. Set conversationComplete true when the caller says goodbye or the task is resolved. ${conversation?.forceClose ? "This is the final turn: close the demonstration clearly and set conversationComplete true." : "Do not close merely because a turn ended."}`
            : ""
        }`,
      },
      { role: "user", content: boundedTranscript },
    ],
  });
  trace.push({
    id: "response",
    label: "Response policy",
    detail: "Bounded candidate buffered—not yet visible",
    status: "reviewed",
    durationMs: drafted.durationMs,
  });

  const checked = await reviewMentalHealthOutput({
    message: boundedTranscript,
    candidate: drafted.value.response,
    route,
    persona,
  });
  const approved = checked.approved;
  trace.push({
    id: "output",
    label: "Output check",
    detail: approved
      ? "Approved before reveal"
      : `Rejected; reviewed ${route} response substituted`,
    status: approved ? "passed" : "replaced",
    durationMs: checked.durationMs,
  });

  return {
    assessment,
    route,
    reply: approved
      ? drafted.value.response
      : reviewedReplyForPersona(route, persona),
    provider: "together" as const,
    model: `${safetyModel} · ${coachModel}`,
    trace,
    conversationComplete:
      persona === "receptionist"
        ? approved
          ? (drafted.value as z.infer<typeof callerCandidateSchema>)
              .conversationComplete
          : true
        : false,
  };
}

export async function POST(request: Request) {
  if (process.env.MENTAL_HEALTH_DEMO_ENABLED === "false") {
    return NextResponse.json(
      { error: "The voice demonstration is temporarily unavailable." },
      { status: 503 },
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a demo scenario or acknowledge the live lab." },
      { status: 400 },
    );
  }

  if (parsed.data.mode === "guided") {
    const scenarioId = parsed.data.scenarioId;
    const edgeCase = getEdgeCase(scenarioId);
    const scenario = edgeCase
      ? edgeCaseAsScenario(edgeCase)
      : [...demoScenarios, ...voiceScenarios].find(
          (candidate) => candidate.id === scenarioId,
        );
    if (!scenario) {
      return NextResponse.json({ error: "Unknown scenario." }, { status: 404 });
    }
    return NextResponse.json(buildGuidedDemoResult(scenario));
  }

  if (parsed.data.mode === "caller") {
    if (process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED === "false") {
      return NextResponse.json(
        { error: "The live caller seat is temporarily unavailable." },
        { status: 503 },
      );
    }

    // The live seat runs the same boundary as the text lab: assess, route,
    // generate only when the route allows it, then review the complete
    // response. Only text that survives that review is signed for speech.
    let result: MentalHealthDemoResult & { conversationComplete?: boolean };
    try {
      result = await runLiveHarness(parsed.data.message, "receptionist", {
        history: parsed.data.history,
        turnNumber: parsed.data.turnNumber,
        forceClose: parsed.data.forceClose,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error && error.name === "TimeoutError"
              ? "The live review took too long. Continue with the reviewed simulation."
              : "The live review is unavailable. Continue with the reviewed simulation.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ...result,
      speechGrant: issueReviewedSpeechGrant({
        text: result.reply,
        speaker: "receptionist",
      }),
    });
  }

  try {
    return NextResponse.json(await runLiveHarness(parsed.data.message));
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "Classifier timed out"
        : "Live classifier unavailable";
    return NextResponse.json(buildFallbackResult(reason));
  }
}

export const runtime = "nodejs";
