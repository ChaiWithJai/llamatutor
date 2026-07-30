# ADR 0004: Typed learning blocks before multimodal UI

- Status: proposed
- Date: 2026-07-30
- Related: #30, #32, ADR 0003

## Context

The landing experience needs to feel more like a tutor than a generic search
box. Llama 4 Maverick is natively multimodal and Together AI's chat API can
accept image inputs, request schema-constrained output, and expose tool calls.
Those capabilities could eventually support learning experiences built from
diagrams, comparisons, checks, and source callouts.

They do **not** justify rendering arbitrary model-authored markup. Raw HTML
would make layout, accessibility, security, and regression behavior
probabilistic. ADR 0003 also records a harder operational constraint: the
configured Together AI account could not call Maverick serverlessly. A
dedicated endpoint and its hourly cost have not been approved.

## Proposed decision

Model output may select and populate a small set of versioned learning blocks.
React remains the renderer.

```ts
type LearningBlock =
  | { type: "explanation"; title: string; markdown: string }
  | { type: "steps"; title: string; items: string[] }
  | {
      type: "comparison";
      title: string;
      columns: Array<{ label: string; points: string[] }>;
    }
  | { type: "check"; prompt: string; options: string[]; answer: number }
  | { type: "source_callout"; sourceIds: string[]; claim: string }
  | {
      type: "image_observation";
      description: string;
      evidence: string[];
      uncertainty?: string;
    };
```

Every response carries a schema version. Zod validates it at the network
boundary. Unknown or invalid blocks fall back to escaped plain text. No path
uses `dangerouslySetInnerHTML`.

## Evaluation harness

The harness is provider-neutral and runs golden JTBD fixtures against a named
model and endpoint:

1. Text-only explanation.
2. One diagram with an evidence-grounded observation.
3. Multiple images that must be compared without conflation.
4. A schema-constrained mix of explanation, steps, check, and sources.
5. A tool call that retrieves named sources.
6. Prompt-injected image text and malformed block payloads.
7. Cancellation during streaming and provider failure.

For every run, record:

- provider, endpoint, model identifier, and schema version;
- endpoint availability and HTTP failure shape;
- schema-valid block rate and tool-argument validity;
- unsupported claims and source-attribution errors;
- time to first token, total latency, input/output/image usage, and cost;
- cancellation behavior and fallback shown to the learner.

The release gate is a checked-in threshold file, not a subjective demo:

- 100% valid top-level schema after at most one repair attempt;
- 0 raw HTML execution paths;
- 0 missing source IDs in `source_callout`;
- truthful, tested 4xx/5xx fallback;
- p95 latency and per-session cost explicitly accepted by the product owner.

## Rollout

1. Ship deterministic, hand-authored learning-path prompts on the landing page.
2. Select a current vision model only after cost and threshold approval.
3. Run the golden harness and attach its report to #32.
4. Add image input behind a feature flag only after the gate passes.
5. Compare real cohort outcomes against the text-only path before broadening
   routing.

## Sources

- [Meta: Llama 4 native multimodality](https://ai.meta.com/blog/llama-4-multimodal-intelligence/)
- [Together AI: vision inputs](https://docs.together.ai/docs/inference/vision/overview)
- [Together AI: structured outputs](https://docs.together.ai/docs/inference/chat/structured-outputs)
- [Together AI: function calling](https://docs.together.ai/docs/inference/function-calling/overview)

## Consequences

The UI stays deterministic and testable while model capability can improve
behind it. Enabling vision requires endpoint authority and cost approval, so
#32 remains open until live evidence satisfies the gate.

## 2026-07-30 provider follow-up

Together removed Maverick on 2026-03-31 and now offers current vision models
serverlessly. The harness remains provider-neutral; its live adapter requires an
explicit model and current per-token prices. No dedicated endpoint is required
to collect the first measurements, and image upload remains disabled until the
measured release gate passes.
