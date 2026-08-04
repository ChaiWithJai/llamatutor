# Voice receptionist safety demo: product requirements

Status: accepted contract for a non-clinical masterclass demonstration

## Outcome

A visitor should understand the practical value before seeing the machinery:
an AI voice receptionist can welcome a caller, clarify a practical request,
remember the answer, propose a useful next step, and stop when interrupted.

The voice interaction owns at least 80% of the first-screen attention. Safety
architecture, evaluation evidence, privacy notes, and infrastructure are
progressively disclosed as FAQ and **How we built this** material. The page must
feel like a product demo first and a technical teardown second.

The masterclass succeeds when a viewer can:

1. start a representative call without onboarding;
2. hear a complete multi-turn scheduling call from greeting to goodbye;
3. interrupt and resume spoken output without losing the conversation;
4. optionally inspect ambiguous and urgent call outcomes; and
5. inspect the transferable implementation only when they ask for it.

## Positioning and boundaries

The visible product name is **AI Voice Receptionist · browser demo**. It may
demonstrate a behavioral-health-practice call, but it is not therapy, crisis
monitoring, diagnosis, treatment, dispatch, or a finished clinical product.

Initial public scope:

- synthetic adult, US-oriented calls;
- natural hosted text-to-speech, transcript, call state, interruption, and outcomes;
- reviewed, alternating caller and receptionist turns for a reliable webinar;
- reviewed booking, clarification, and urgent response copy;
- an optional acknowledged live Together text guardrail;
- no microphone, phone number, sign-in, persistence, outbound message, or alert;
- no claim that a human is listening or will intervene.

The browser simulation must never be represented as live telephony. Phone
numbers and a real-time media runtime are explicitly outside this demo scope.

## Experience contract

### Primary surface: the call

The page opens directly on the call experience. It contains:

- one compact experiment header;
- three synthetic caller cards, with routine scheduling selected by default;
- a dominant dark call console with line state, waveform, timer, and transcript;
- one unmistakable **Start the call** control;
- visible pause, resume, and end controls during the call;
- a call outcome that explains what useful work was completed; and
- a commercial invitation only after non-urgent outcomes.

The routine call is a complete, application-owned script of at least eight
alternating turns. Nothing is pre-rendered in the transcript: the first turn is
Maya's audible greeting, and each turn appears only when its audio begins. The
state machine is:

```text
standby → connecting → speaking ↔ next reviewed turn → complete
                           └→ paused → resume
                           └→ ended
```

Pause stops the current audio while preserving its position. Resume continues
that turn. End cancels audio, pending fetches, and stale callbacks. If hosted
speech fails, the complete reviewed transcript continues visually and quietly;
the application never falls back to an operating-system voice.

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
- Guided calls use deterministic, reviewed copy so the demo survives provider
  failure and never exposes unchecked generated speech.
- `/api/mental-health/speech` accepts only a scenario ID and turn index, resolves
  the allowlisted script server-side, and requests MP3 speech from Together.
- Receptionist and caller use distinct Together voices. The Together API key is
  never exposed to the browser.
- The browser plays returned audio without microphone or phone capture. It does
  not use `speechSynthesis` as a fallback.

### Web-only multi-turn adapter

```text
Scenario + turn index → allowlisted application script → Together TTS proxy
                      → browser audio + synchronized transcript → next turn
```

Netlify serves the complete demo. No phone number, Twilio/LiveKit connection,
DigitalOcean worker, microphone permission, or raw audio transport is needed.
This keeps the masterclass reproducible while preserving the application-owned
policy and cancellation seams that could later support another channel.

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
kill-switch drills, and release evidence. Issue #57 owns the web-only
multi-turn lifecycle, interruption recovery, and acceptance evidence. Issue
#63 owns the reassuring experience outcome. Issue #58 is closed as not planned
for this demo and remains only as future telephony prior art.

## Data contract

- no raw public-demo text in Plausible, Helicone, application logs, browser
  storage, Netlify Database, CI artifacts, or benchmark reports;
- allowlisted synthetic script text is sent transiently to Together for speech;
- live free-form text is sent transiently to Together only after explicit
  acknowledgement inside the disclosed guardrail lab;
- browser-demo analytics contain scenario ID, route, policy, provider, and
  interaction actions—not transcript content;
- no microphone audio is captured, recorded, or uploaded by the browser demo;
- returned synthetic MP3 audio is not persisted by the application;
- bounded in-memory phone history must be erased at call end.

## Acceptance gates

- the voice demo is the dominant first-screen surface at 390, 830, and 1353 px;
- the routine call begins with an audible greeting, contains at least eight
  alternating turns, and ends with an honest goodbye;
- disclosed elevated and urgent synthetic calls reach their expected outcomes;
- urgent output contains reviewed resources and no commercial CTA;
- pause/resume preserves the current audio position, and end cancels stale work;
- hosted speech failure produces a calm visual-only call without a robotic
  operating-system voice;
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
4. Privacy, retention, consent, incident, and kill-switch ownership for any
   future real calls.
5. Any future phone number, runtime, credentials, or shared-host changes.

## Primary references

- [SonderMind guardrail evals](https://github.com/SonderMindOrg/sonder-guardrail-evals)
- [Together structured outputs](https://docs.together.ai/docs/inference/chat/structured-outputs)
- [Together realtime transcription](https://docs.together.ai/reference/audio-transcriptions-realtime)
- [Together text to speech overview](https://docs.together.ai/docs/inference/text-to-speech/overview)
- [Together audio speech API](https://docs.together.ai/reference/audio-speech)
- [Twilio bidirectional Media Streams](https://www.twilio.com/docs/voice/media-streams/websocket-messages)
- [SAMHSA 988 FAQ](https://www.samhsa.gov/mental-health/988/faqs)
- [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
