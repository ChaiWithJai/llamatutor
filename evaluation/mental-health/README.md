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

## Review workflow

1. Engineering pins the model, prompt, policy, adapter, corpus hash, and thresholds.
2. A clinical reviewer and lived-experience reviewer independently label a separate route overlay.
3. Differences are adjudicated without model output visible to the reviewers.
4. The public report contains only aggregate metrics and scenario IDs.
5. Any policy/model change creates a new report; it never overwrites prior evidence.
6. A release owner records the decision and residual risk in `governance.md`.

Raw public-demo text must never enter this directory, logs, analytics, CI
artifacts, Helicone, or the learning database.
