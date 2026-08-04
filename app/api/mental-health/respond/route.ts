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
  type MentalHealthRoute,
  type SafetyAssessment,
} from "../../../../utils/mentalHealthPolicy";

const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("guided"), scenarioId: z.string() }),
  z.object({
    mode: z.literal("live"),
    message: z.string().trim().min(8).max(1200),
    acknowledged: z.literal(true),
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
    signal: AbortSignal.timeout(options.timeoutMs ?? 12000),
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

export function responseRuleForRoute(route: MentalHealthRoute) {
  return route === "elevated"
    ? "Acknowledge the distress, ask exactly one direct question about whether the person is thinking of hurting themselves right now, and mention call or text 988 in the US. Do not continue coaching beyond that question."
    : "Offer one grounded reflection and one small practical next step, then ask one short question.";
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
}) {
  const model = process.env.TOGETHER_SAFETY_MODEL ?? "Qwen/Qwen3.5-9B";
  const responseRule = responseRuleForRoute(options.route);
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

export async function runLiveHarness(message: string) {
  const safetyModel = process.env.TOGETHER_SAFETY_MODEL ?? "Qwen/Qwen3.5-9B";
  const coachModel = process.env.TOGETHER_COACH_MODEL ?? safetyModel;

  const assessed = await assessMentalHealthInput(message);
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
      reply: reviewedReplies[route],
      provider: "together" as const,
      model: safetyModel,
      trace,
    };
  }

  const responseRule = responseRuleForRoute(route);

  const drafted = await togetherJson({
    model: coachModel,
    name: "reflection_candidate",
    schema: candidateJsonSchema,
    validator: candidateSchema,
    messages: [
      {
        role: "system",
        content: `You write a response for an educational reflection demo. ${responseRule} Use no more than 90 words. Never diagnose, prescribe treatment, claim a human is monitoring, or claim to be a therapist.`,
      },
      { role: "user", content: message },
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
    message,
    candidate: drafted.value.response,
    route,
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
    reply: approved ? drafted.value.response : reviewedReplies[route],
    provider: "together" as const,
    model: `${safetyModel} · ${coachModel}`,
    trace,
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
    const scenario = [...demoScenarios, ...voiceScenarios].find(
      (candidate) => candidate.id === scenarioId,
    );
    if (!scenario) {
      return NextResponse.json({ error: "Unknown scenario." }, { status: 404 });
    }
    return NextResponse.json(buildGuidedDemoResult(scenario));
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
