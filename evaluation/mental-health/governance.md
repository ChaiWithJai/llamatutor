# Governance record

## Current decision

- Date: 2026-08-04
- Policy: `demo-2026-08-04`
- Model alias/resolved model: `TOGETHER_SAFETY_MODEL` / `Qwen/Qwen3.5-9B`
- External source: commit and hashes in `sondermind-source.json`
- Report: `reports/sondermind-current.json`
- Gate: **failed**
- Allowed release: synthetic, non-clinical browser demonstration only
- Forbidden release: unrestricted support, real patient calls, clinical claims, or automatic emergency action

Failed checks are overall input recall, overall input specificity, self-harm
recall, and acceptable-output specificity. The current guard is conservative on
output but still misses input labels. That combination is appropriate evidence
for teaching layered controls; it is not approval for a public support product.

## Required independent authority

The following fields intentionally remain unapproved:

| Decision                                    | Required owner                         | Current state      |
| ------------------------------------------- | -------------------------------------- | ------------------ |
| Route overlay                               | Named clinical reviewer                | Unassigned         |
| False-positive recovery                     | Lived-experience reviewer              | Unassigned         |
| Jurisdiction and age scope                  | Product + legal/privacy owner          | Adult US demo only |
| Incident response and kill-switch authority | Named operational owner                | Unassigned         |
| External corpus redistribution/CI use       | Upstream license or written permission | Unresolved         |

Engineering must not fill these cells by inference.

## Annotation exchange contract

Reviewer files may contain only scenario IDs and reviewer-owned labels:

```json
{
  "schemaVersion": 1,
  "sourceCommit": "4a3c503e0f55de86c2270c1560cb54a7e2a3bf49",
  "policyVersion": "demo-2026-08-04",
  "reviewerRole": "clinical | lived_experience",
  "reviewerId": "assigned-outside-public-repo",
  "annotations": [
    {
      "scenarioId": "input-001",
      "route": "routine | elevated | urgent | not_applicable",
      "confidence": "high | medium | low",
      "noteCode": "reviewer-controlled-short-code"
    }
  ]
}
```

Public repository artifacts must not contain reviewer identity, raw case text,
free-form sensitive notes, or clinical records.

## Kill-switch drill

The runtime kill switch is `MENTAL_HEALTH_DEMO_ENABLED=false`.

1. Set it in the affected Netlify context without changing source.
2. Verify the API returns `503` and no provider call is attempted.
3. Verify the page presents an owned unavailable state on the next request.
4. Record detection time, disable time, verification time, and operator.
5. Re-enable only after the release owner links a passing corrective check.

The drill is not complete until a named operator runs it in preview and records
evidence. Do not exercise the production kill switch during a live masterclass.
