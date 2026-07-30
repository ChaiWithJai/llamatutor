import { z } from "zod";

export const LEARNING_BLOCK_SCHEMA_VERSION = "1.0" as const;

const rawHtmlPattern = /<\/?[a-z][^>]*>/i;
const visibleText = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine((value) => !rawHtmlPattern.test(value), {
    message: "Raw HTML is not allowed in learning blocks",
  });
const shortText = visibleText.pipe(z.string().max(240));
const sourceId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9._:-]+$/);

const explanationBlockSchema = z
  .object({
    type: z.literal("explanation"),
    title: shortText,
    markdown: visibleText,
  })
  .strict();

const stepsBlockSchema = z
  .object({
    type: z.literal("steps"),
    title: shortText,
    items: z
      .array(visibleText.pipe(z.string().max(600)))
      .min(1)
      .max(12),
  })
  .strict();

const comparisonBlockSchema = z
  .object({
    type: z.literal("comparison"),
    title: shortText,
    columns: z
      .array(
        z
          .object({
            label: shortText,
            points: z
              .array(visibleText.pipe(z.string().max(600)))
              .min(1)
              .max(8),
          })
          .strict(),
      )
      .min(2)
      .max(4),
  })
  .strict();

const checkBlockSchema = z
  .object({
    type: z.literal("check"),
    prompt: visibleText.pipe(z.string().max(600)),
    options: z.array(shortText).min(2).max(6),
    answer: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((block, context) => {
    if (block.answer >= block.options.length) {
      context.addIssue({
        code: "custom",
        message: "The answer must index one of the supplied options",
        path: ["answer"],
      });
    }
  });

const sourceCalloutBlockSchema = z
  .object({
    type: z.literal("source_callout"),
    sourceIds: z.array(sourceId).min(1).max(12),
    claim: visibleText.pipe(z.string().max(1_000)),
  })
  .strict();

const imageObservationBlockSchema = z
  .object({
    type: z.literal("image_observation"),
    description: visibleText.pipe(z.string().max(1_000)),
    evidence: z
      .array(visibleText.pipe(z.string().max(600)))
      .min(1)
      .max(12),
    uncertainty: visibleText.pipe(z.string().max(600)).optional(),
  })
  .strict();

export const learningBlockSchema = z.discriminatedUnion("type", [
  explanationBlockSchema,
  stepsBlockSchema,
  comparisonBlockSchema,
  checkBlockSchema,
  sourceCalloutBlockSchema,
  imageObservationBlockSchema,
]);

export const learningResponseSchema = z
  .object({
    schemaVersion: z.literal(LEARNING_BLOCK_SCHEMA_VERSION),
    blocks: z.array(learningBlockSchema).min(1).max(12),
  })
  .strict();

export type LearningBlock = z.infer<typeof learningBlockSchema>;
export type LearningResponse = z.infer<typeof learningResponseSchema>;

export type ParsedLearningResponse =
  | { ok: true; response: LearningResponse }
  | { ok: false; fallbackText: string; issues: string[] };

function asPlainText(input: unknown): string {
  if (typeof input === "string") return input.slice(0, 4_000);

  try {
    return JSON.stringify(input).slice(0, 4_000);
  } catch {
    return "The tutor returned a response that could not be displayed.";
  }
}

export function parseLearningResponse(input: unknown): ParsedLearningResponse {
  const parsed = learningResponseSchema.safeParse(input);
  if (parsed.success) return { ok: true, response: parsed.data };

  return {
    ok: false,
    fallbackText: asPlainText(input),
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "response"}: ${issue.message}`,
    ),
  };
}

export function citedSourceIds(response: LearningResponse): string[] {
  return [
    ...new Set(
      response.blocks.flatMap((block) =>
        block.type === "source_callout" ? block.sourceIds : [],
      ),
    ),
  ];
}
