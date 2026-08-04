# Incident and evaluation exception log

## 2026-08-04 — Initial external calibration failed the prototype gate

- Detection: full pinned SonderMind calibration run
- User impact: none; synthetic engineering evaluation only
- Evidence: `reports/sondermind-current.json`
- Observed: 42 upstream binary input labels missed, 19 negative controls flagged,
  one rejected output approved, and 38 accepted outputs rejected
- Containment: keep public experience synthetic; retain deterministic guided
  routes and reviewed urgent replacement; expose no clinical claim
- Follow-up: independent route overlay, prompt/model comparison on a development
  slice, held-out confirmation, voice transcript perturbations, named reviewers
- Status: open; release gate remains failed

Voice perturbation evidence is in `reports/voice-perturbations-current.json`.
The route remained stable for 33 of 36 deterministic variants; two scenario IDs
changed route. This keeps live acoustic/STT acceptance open rather than treating
synthetic text changes as proof of voice robustness.

Future incidents must record detection, impact, containment, evidence, owner,
corrective action, regression coverage, and closure authority without copying raw
sensitive content into this file.
