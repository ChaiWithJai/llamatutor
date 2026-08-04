# Mental-health safety evaluation

This directory contains the content-free release evidence for the bounded voice
receptionist demonstration. It is not a clinical validation suite.

## Run the external calibration

The SonderMind corpus is not downloaded, copied, or redistributed by this
repository because no license was present at the pinned upstream commit. Clone
it separately, check out the commit in `sondermind-source.json`, acknowledge its
content warning, and run:

```bash
TOGETHER_API_KEY=… pnpm eval:mental-health:sondermind \
  --source /absolute/path/to/sonder-guardrail-evals
```

To replay a deterministic 107-ID (30.1%) sample one human turn at a time while
keeping all external text in the local process only:

```bash
TOGETHER_API_KEY=… pnpm eval:mental-health:sondermind -- \
  --source /absolute/path/to/sonder-guardrail-evals \
  --trajectory --trajectory-count 107
```

The trajectory report records positional ID, category, turn, route, abstention,
candidate presence/approval, latency, and provider error only. Because the
upstream corpus has no receptionist-state labels, conversation contradiction,
repair, premature close, and resolution stay explicitly `null`; those are
release-gated by the application-owned suite below rather than guessed.

The runner verifies both files by SHA-256 before reading them. Console progress
contains counts only. The public JSON report contains aggregate metrics,
categories, issue labels, model/policy provenance, and positional scenario IDs;
it contains no prompt or response text.

## Interpret the gate

`thresholds.json` is chosen before model comparison. One high aggregate score
cannot hide a ruinous slice. The gate separates:

- overall detection recall and benign specificity;
- immediate-danger and self-harm recall;
- harmful-output rejection recall and acceptable-output specificity;
- provider errors, p95 latency, and estimated list-price cost.

The current report fails closed. A failed gate keeps the experience a synthetic
engineering demonstration. Do not tune on the entire external corpus and then
describe a rerun as independent evidence.

## Run the conversation trajectory gate

Issue #69 adds a separate deterministic gate for conversation state. It does
not replace or improve the 255 input / 100 output guardrail scores above:

```bash
pnpm eval:mental-health:trajectories
pnpm eval:mental-health:trajectories -- --details
```

The 128 application-owned synthetic trajectories comprise 107 distinct,
evenly spaced content-free IDs from the pinned 355-case SonderMind report and
seven methodology probes each for MindEval, HealthBench, and VERA-MH. No
upstream prompt, response, clinical record, or benchmark example is copied.
The detailed mode reports only IDs and per-turn facts: transition validity,
contradiction, correction uptake, question alignment, constraint carryover,
repeated questions, premature close, resolution/handoff, fallback use, latency,
route status, and provider errors.

This deterministic gate intentionally reports route as `not-run`, latency as
zero, and fallback use as true. Provider quality, safety routing, and measured
latency remain separate live and pinned-corpus checks; combining them into one
score would conceal which layer failed. The methodology choices are documented
in the repository-root `context.json` with primary-source links.

## Review workflow

1. Engineering pins the model, prompt, policy, adapter, corpus hash, and thresholds.
2. A clinical reviewer and lived-experience reviewer independently label a separate route overlay.
3. Differences are adjudicated without model output visible to the reviewers.
4. The public report contains only aggregate metrics and scenario IDs.
5. Any policy/model change creates a new report; it never overwrites prior evidence.
6. A release owner records the decision and residual risk in `governance.md`.

Raw public-demo text must never enter this directory, logs, analytics, CI
artifacts, Helicone, or the learning database.
