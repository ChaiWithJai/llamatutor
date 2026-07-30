# Typed learning-block evaluation harness

This harness turns ADR 0004's safety and quality claims into checked-in,
provider-neutral gates. It does not enable image upload and it does not select
or purchase a model endpoint.

## Contract

Every completed model run must return `schemaVersion: "1.0"` and one or more
supported blocks:

- explanation
- steps
- comparison
- check
- source callout
- image observation

`utils/learningBlocks.ts` is the network-boundary contract. Zod rejects unknown
blocks, out-of-range check answers, extra fields, and raw HTML. Invalid payloads
become plain text for a React text node; no renderer receives model-authored
HTML.

## Golden fixtures

`evaluation/learning-blocks/goldenFixtures.ts` covers:

1. text explanation;
2. one-image evidence;
3. multi-image comparison without conflation;
4. explanation, steps, check, and source attribution;
5. invented source IDs;
6. prompt-injected image text;
7. malformed/unknown block payloads;
8. cancellation;
9. provider failure.

Run the offline contract gate with:

```bash
pnpm test:learning-blocks
```

The fixtures include deliberately invalid candidates. They pass only when the
harness rejects them for the expected reason.

## Live adapter

The checked-in runner exercises every JTBD fixture against an OpenAI-compatible
chat-completions endpoint. It generates deterministic PNG diagrams in memory,
so a run does not depend on external image hosts and does not commit screenshots
or reports to the repository.

Pricing is an explicit input rather than a stale model-name lookup. The runner
uses it with provider-reported token counts and records the model, endpoint,
schema version, outcome, time to first token, total latency, image count, usage,
and computed cost without printing the API key or lesson output.

For Together's current low-cost serverless vision baseline (prices checked
2026-07-30):

```bash
TOGETHER_API_KEY=... pnpm eval:learning-blocks:live -- \
  --model Qwen/Qwen3.5-9B \
  --input-price 0.10 \
  --output-price 0.15 \
  --output /tmp/llamatutor-learning-block-report.json
```

The command deliberately exits non-zero while latency or cost thresholds remain
unapproved, even if the provider calls succeed. Attach the JSON from `/tmp` to
issue #32; do not commit it.

The live path verifies:

- text, single-image, and multi-image requests;
- streamed time to first token and total latency;
- Zod/JSON Schema constrained learning blocks;
- approved source IDs and a real `get_source` tool-call contract;
- prompt-injection resistance and raw-HTML rejection;
- intentional stream cancellation and truthful provider failure;
- provider-reported token usage and price-derived per-fixture cost.

## Live adapter record

A provider adapter must write one `LiveRunMetadata` record per fixture without
secrets or lesson content:

```ts
{
  (fixtureId,
    outcome,
    provider,
    endpoint,
    model,
    schemaVersion,
    startedAt,
    endpointAvailable,
    httpStatus,
    timeToFirstTokenMs,
    totalLatencyMs,
    inputTokens,
    outputTokens,
    imageCount,
    costUsd);
}
```

The adapter owns provider-specific HTTP, structured-output, tool-call,
cancellation, and usage parsing. The evaluator owns the stable product gates.
This separation lets Together, another provider, or a local endpoint run the
same fixtures without changing their acceptance criteria.

Every fixture needs a matching metadata record. Partial runs, unavailable
endpoints, or missing latency/token/cost fields make the gate fail rather than
silently shrinking the denominator.

## Release gate

`evaluation/learning-blocks/thresholds.json` requires:

- 100% valid top-level schema after at most one repair;
- zero raw HTML blocks;
- zero unknown source IDs;
- truthful fallback for every cancellation or provider error.

Latency and cost are intentionally `null`. The live gate cannot pass until the
product owner approves explicit `p95LatencyMs` and `maxCostUsd` values for the
selected current model. This prevents a successful demo from silently becoming
production policy.

After model and threshold approval:

1. configure the provider key outside the repository;
2. run all nine fixtures and save metadata/report artifacts to issue #32;
3. set accepted latency and cost budgets in the threshold file;
4. rerun the suite and attach the report;
5. expose image input behind a feature flag only if every gate passes.

Together removed Llama 4 Maverick on 2026-03-31. Current serverless vision
models are preferable for this low-traffic experiment because they have no
fixed hourly charge. See ADR 0003's dated follow-up and the provider's
[model catalog](https://docs.together.ai/docs/serverless/models).
