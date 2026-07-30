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

## Live adapter record

A provider adapter must write one `LiveRunMetadata` record per fixture without
secrets or lesson content:

```ts
{
  (fixtureId,
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
product owner approves explicit `p95LatencyMs` and `maxCostUsd` values after a
Maverick-capable dedicated endpoint is priced. This prevents a successful demo
from silently becoming production policy.

After endpoint approval:

1. configure the endpoint outside the repository;
2. run all nine fixtures and save metadata/report artifacts to issue #32;
3. set accepted latency and cost budgets in the threshold file;
4. rerun the suite and attach the report;
5. expose image input behind a feature flag only if every gate passes.
