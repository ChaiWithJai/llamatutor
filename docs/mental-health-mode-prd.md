# Voice receptionist safety demo: product requirements

Status: accepted contract for a non-clinical masterclass demonstration

## Outcome

A visitor should understand the practical value before seeing the machinery:
an AI voice receptionist can listen, choose a useful next step, speak, stop when
interrupted, and change course when a caller's language requires more care.

The voice interaction owns at least 80% of the first-screen attention. Safety
architecture, evaluation evidence, privacy notes, and infrastructure are
progressively disclosed as FAQ and **How we built this** material. The page must
feel like a product demo first and a technical teardown second.

The masterclass succeeds when a viewer can:

1. start a representative call without onboarding;
2. hear and see the receptionist handle a normal scheduling request;
3. interrupt spoken output and understand that stale audio was cancelled;
4. compare routine, ambiguous, and urgent call outcomes; and
5. inspect the transferable implementation only when they ask for it.

## Positioning and boundaries

The visible product name is **AI Voice Receptionist · browser demo**. It may
demonstrate a behavioral-health-practice call, but it is not therapy, crisis
monitoring, diagnosis, treatment, dispatch, or a finished clinical product.

Initial public scope:

- synthetic adult, US-oriented calls;
- browser speech synthesis, transcript, call state, interruption, and outcomes;
- reviewed booking, clarification, and urgent response copy;
- an optional acknowledged live Together text guardrail;
- no microphone, phone number, sign-in, persistence, outbound message, or alert;
- no claim that a human is listening or will intervene.

The browser simulation must never be represented as live telephony. A real
phone adapter remains a separate runtime and acceptance slice.

## Experience contract

### Primary surface: the call

The page opens directly on the call experience. It contains:

- one concise outcome-oriented headline;
- three compact synthetic caller choices;
- a dominant receptionist console with call state and transcript;
- one unmistakable **Start demo call** control;
- a visible **Interrupt voice** control while speech is queued;
- a call outcome that explains what useful work was completed; and
- a commercial invitation only after non-urgent outcomes.

The call state machine is:

```text
idle → connecting → listening → deciding → speaking → complete
                                           └→ interrupted
```

Interruption cancels browser speech immediately. The future phone adapter must
also cancel the provider TTS context and clear Twilio's queued media before the
next turn.

### Progressive disclosure

Everything that explains implementation follows the demo in native, keyboard
operable disclosures:

1. How did you build the voice experience?
2. What happens when a caller says something risky?
3. Is this therapy or a finished clinical product?
4. What did you evaluate?
5. Inspect the live Together guardrail.

The four-stage safety trace appears inside the risk disclosure after a call. It
must not compete with the transcript on the primary surface.

### Route behavior

| Route      | Visible behavior                                                                                | Forbidden behavior                                                         |
| ---------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `routine`  | Offer a bounded useful next step such as two demo appointment times.                            | Invent a confirmed appointment or durable record.                          |
| `elevated` | Pause scheduling, acknowledge distress, ask one direct safety clarification, keep US 988 close. | Continue coaching as if risk were resolved.                                |
| `urgent`   | Stop generative flow and return reviewed 988/911/trusted-person/safer-place options.            | Commercial CTA, automatic call/text/dispatch, hangup, or monitoring claim. |

Application code owns the route. Invalid JSON, unknown enums, timeout, provider
failure, abstention, or confidence below 0.72 cannot silently become `routine`.
Unchecked generated text never enters the UI or audio queue.

## Architecture

### Demonstration now

- Next.js and Netlify render the page and short request/response control plane.
- `/api/mental-health/respond` owns structured input assessment, application
  routing, bounded generation, output review, and reviewed replacement.
- Guided calls use deterministic copy so the demo survives provider failure.
- Browser speech synthesis makes speaking and cancellation demonstrable without
  collecting microphone or phone data.

### Phone adapter

```text
Caller → Twilio Media Streams → bounded DigitalOcean voice worker
       → Together realtime STT → typed safety turn contract
       → approved response → Together realtime TTS → Twilio → Caller
```

Netlify stays the web/control plane. The already-paid DigitalOcean Droplet is a
candidate long-running media plane only after Issue #58's snapshot, ingress,
firewall, isolation, monitoring, and rollback gates pass. It holds no durable
call data and runs no local model.

## Evaluation and governance

Issue #60 is the current-system evidence gate. The benchmark:

- reads the external SonderMind corpus from a manually supplied pinned checkout;
- verifies commit-independent SHA-256 file hashes and observed counts;
- never vendors or redistributes the corpus while its license is unresolved;
- compares input detection and output approval across all 255/100 cases;
- reports confusion matrices, category/issue slices, abstention, errors,
  p50/p95 latency, tokens, model alias, policy version, and limitations;
- writes only aggregate metrics and scenario identifiers, never raw case text.

External labels calibrate the guard; they do not define our route or prove
clinical safety. A separately reviewed route overlay, held-out cases, and
voice transcript perturbations remain required before broader release.

Issue #55 owns versioned thresholds, reviewer annotation, incident history,
kill-switch drills, and release evidence. Issue #57 owns phone lifecycle,
partial/final transcripts, barge-in, provider loss, transfer, reconnect, and
audio-queue acceptance. Issue #58 owns the reversible host baseline.

## Data contract

- no raw public-demo text in Plausible, Helicone, application logs, browser
  storage, Netlify Database, CI artifacts, or benchmark reports;
- live text is sent transiently to Together only after explicit acknowledgement;
- browser-demo analytics contain scenario ID, route, policy, provider, and
  interaction actions—not transcript content;
- no audio is recorded or uploaded by the browser demo;
- bounded in-memory phone history must be erased at call end.

## Acceptance gates

- the voice demo is the dominant first-screen surface at 390, 830, and 1353 px;
- normal, elevated, and urgent synthetic calls reach their expected outcomes;
- urgent output contains reviewed resources and no commercial CTA;
- barge-in cancels current audio and shows a legible recovery state;
- the safety trace is collapsed by default and keyboard reachable;
- reduced-motion mode disables nonessential movement;
- no page-level horizontal overflow;
- lint, unit, build, Playwright, Netlify validation, preview, and production
  smoke checks pass;
- the #60 report contains no raw corpus text.

## External decisions that remain gated

1. License or written permission for CI use or redistribution of the external corpus.
2. Named clinical and lived-experience reviewers for route overlays and claims.
3. Any expansion beyond a synthetic adult US engineering demo.
4. Privacy, retention, consent, incident, and kill-switch ownership for real calls.
5. Destructive or availability-affecting changes to the shared Droplet.
6. Twilio phone number, DNS, quotas, and production voice credentials.

## Primary references

- [SonderMind guardrail evals](https://github.com/SonderMindOrg/sonder-guardrail-evals)
- [Together structured outputs](https://docs.together.ai/docs/inference/chat/structured-outputs)
- [Together realtime transcription](https://docs.together.ai/reference/audio-transcriptions-realtime)
- [Together realtime speech](https://docs.together.ai/reference/audio-speech-websocket)
- [Twilio bidirectional Media Streams](https://www.twilio.com/docs/voice/media-streams/websocket-messages)
- [SAMHSA 988 FAQ](https://www.samhsa.gov/mental-health/988/faqs)
- [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
