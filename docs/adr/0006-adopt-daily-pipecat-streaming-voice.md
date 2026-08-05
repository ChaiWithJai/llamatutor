# ADR 0006: Adopt Daily/Pipecat streaming voice as the target architecture; dramatically simplify the conversation layer to get there

- Status: accepted
- Date: 2026-08-05
- Decision owner: Jai Bhagat
- Related: Issue #71, PR #72, ADR 0001, ADR 0005, `docs/deployment.md`

## Context

Issue #71 traced a live production failure — the receptionist repeating one
scripted scheduling question at a caller disclosing emotional distress — to
the shape of the current conversation layer: a closed intent enum authored by
a keyword cascade, gating a hand-written reply state machine, over sequential
turn-based REST calls (three blocking model calls per caller turn).

Draft PR #72 patched the two incident phrases and immediately reproduced the
failure class it was fixing: live testing against its own deploy preview
showed legitimate surgery, billing, and insurance requests misrouted into the
new `emotional_support` branch, because a closed-enum keyword cascade cannot
represent an open intent space no matter how many branches it accumulates.
Every new caller behavior currently costs a new enum value, a new regex, new
scripted copy, and new branch tests — and each addition raises the collision
risk for the branches that already exist. The complexity is compounding in
the wrong direction.

Separately, the same architecture imposes a measured 3,000–5,000 ms of dead
air per turn (sequential assess → draft → review calls), and makes barge-in —
a caller interrupting the receptionist, the single most human property of a
phone call — structurally impossible. ADR 0005 accepted those limits for the
first bounded web demo. They are now the limiting factor on the product's
actual job: demonstrating a conversation fluid enough that a prospective
client believes an AI can answer their phones.

### What the streaming target is

Daily hosts WebRTC transport (rooms, SFU, media). Pipecat, Daily's
open-source framework, structures a real-time voice agent as a streaming
pipeline: VAD-based turn detection → streaming STT → streaming LLM →
streaming TTS, with first-class interruption handling. The bot is a single
long-running process that joins a Daily room as a participant — Daily runs
the media infrastructure, we run only the conversation logic.

This is not a transport swap; it is the architecture that makes the
simplification possible. In a streaming pipeline there is no place for a
keyword cascade authoring replies from an enum — the model responds to the
conversation, and safety is enforced by guards on what it produces, not by
guessing the caller's category before it is allowed to speak.

### The honest lift

1. A persistent Python bot process per active call. Our existing
   DigitalOcean deployment path (ADR 0001: `deploy/compose.yml`,
   `deploy/deploy.sh`, Caddy, GHCR, health-checked rollback) already hosts
   exactly this workload shape; the droplet's ~2.3 GB free memory bounds a
   pilot at one-to-two concurrent calls with the swap buffer ADR 0001
   already recommends. Production concurrency needs a sizing pass and likely
   a dedicated droplet — the same escalation rule ADR 0001 set.
2. The safety gate must be redesigned for streaming, not ported. The current
   guarantee is "generate the full candidate, review it, only then speak."
   The streaming equivalent is per-utterance buffered review: the pipeline
   buffers each sentence/clause, runs the invariant guards on it, and
   releases it to TTS only on approval — preserving reviewed-before-spoken
   at a finer grain, at the cost of building that incremental review stage.
   Speak-while-generating with a kill-switch is rejected: it weakens the
   guarantee this product's safety story depends on.
3. Streaming STT/TTS providers replace the current transcribe/speech routes.
4. The golden-trajectory eval harness (`evaluation/mental-health/`) extends
   from text-in/text-out to transcript-level assertions on streamed calls;
   audio-level acceptance is a later layer.
5. VAD/turn-taking tuning is ongoing operational work, not an integration
   one-off.

### Benchmark that motivated the decision

| | Current (sequential REST) | Daily/Pipecat, tuned |
|---|---|---|
| Time to first audio | 3,000–5,000 ms (measured live) | 600–1,200 ms (industry-typical; to be measured in our pilot) |
| Barge-in | Structurally impossible | Native |
| Conversation layer | Enum + cascade + scripted copy (compounding complexity) | Generate-then-guard (complexity deleted, not managed) |
| Infra | Serverless only | Existing droplet path (pilot), Daily-hosted media |

### Research reconciliation

A dedicated research pass
(`docs/research/voice-ai-streaming-architecture-research.md`) sharpened three
facts this ADR must not blur:

1. **Pipecat's default posture conflicts with our safety gate.** Out of the
   box, Pipecat streams LLM tokens into TTS at sentence granularity for
   latency. No first-party moderation/review processor ships with it. A
   compliant design therefore deliberately does *not* stream the response
   leg: the guard layer buffers each utterance, reviews it, and only then
   releases it to TTS. Consequence: our realistic first-audio latency sits
   above the 600–1,200 ms industry-typical row — the streaming wins we
   actually bank are on the input side (VAD turn detection, streaming STT,
   no per-turn HTTP round trips) plus barge-in. The pilot exists to measure
   the honest number.
2. **Unit economics favor REST at today's volume.** At 100–1,000 calls/week,
   the current architecture runs ~$0.10–0.45/call with zero fixed infra;
   Daily/Pipecat runs ~$0.15–0.60/call plus a $20–150/month fixed hosting
   floor. Streaming wins economically only at much higher volume. This ADR
   therefore adopts Daily/Pipecat on **capability grounds** — barge-in,
   fluid turn-taking, and native human-in-the-loop (a staff member can join
   the Daily room, making "a practice staff member would need to continue
   from here" operationally real instead of scripted copy) — not on cost.
3. **Boardy.ai is a positioning comparable, not an architecture reference.**
   Public information is thin (OpenAI + Anthropic confirmed via privacy
   policy; no disclosed voice stack, latency, or safety documentation).

The research pass, run before this decision inverted, recommended staying
REST until volume or a hard live-takeover requirement forced the move. The
decision owner overrides that timing on product-direction grounds — the
demo's differentiator is conversational fluidity, and the simplification is
prerequisite work either way — while adopting the research's structural
design constraint wholesale: the response leg stays buffer-then-review, and
the pre-TTS review processor is built and proven as its own workstream
(issue #75) before any transport migration.

## Decision

Adopt Daily + Pipecat as the target voice architecture. Reach it through
dramatic simplification of the conversation layer, in order:

1. **Simplify first (prerequisite, on the current stack).** Delete the
   keyword cascade and the enum-authored reply branches. The `intent` enum
   demotes to bookkeeping (turn count, offered/accepted slots, force-close).
   Generation answers freely from full conversation history; a guard layer
   checks every candidate against invariants that do not require knowing the
   caller's category: never confirm a booking, never diagnose, never claim
   to be a therapist, never repeat the prior receptionist turn without new
   information, always engage the caller's actual content. The scripted
   copy that survives is the small safety-critical set (urgent route,
   bounded-handoff closes). This guard layer is written once and is exactly
   the per-utterance review stage the streaming pipeline needs — nothing
   here is throwaway.
2. **Pilot the pipeline.** Stand up a Pipecat bot on the existing droplet
   deployment path, joined to a Daily room, wearing the guard layer from
   step 1 as its per-utterance review stage. One concurrent call, staging
   only, behind the existing basic-auth pattern. Measure real first-audio
   latency and barge-in behavior against the benchmark above.
3. **Promote.** Extend the golden-trajectory evals to streamed transcripts,
   size production compute, and cut the demo over. The REST harness remains
   as the text-lab inspection surface (ADR 0005's acknowledged live lab),
   not the primary call path.

Issue #71 and PR #72 are superseded by this direction: the failure they
documented is not fixed by another enum branch, it is dissolved by removing
the enum's authority. Their evidence — the production replay, the collision
regression, the rejection-reason taxonomy — carries forward as the seed of
the guard layer's test suite.

## Alternatives considered

### Keep extending the enum state machine (PR #72's direction)

Rejected. Live evidence shows each added branch misroutes neighboring
intents; the marginal branch now subtracts reliability. This is the
complexity we are choosing to delete rather than manage.

### Streaming-lite only (SSE token streaming, fewer chained calls, no new transport)

Rejected as the destination, adopted as tactics. It recovers most of the
latency but can never deliver barge-in, and it leaves two conversation
architectures to maintain if the streaming move happens later anyway. Its
useful pieces (fewer sequential calls, pre-synthesized safety audio) fold
into step 1.

### Defer the decision until a client demands barge-in

Rejected. An earlier draft of this ADR took that position. It undervalued
two things: the demo's differentiator *is* conversational fluidity, so the
latency/interruption ceiling is a present cost, not a future one; and the
prerequisite work (the guard layer) is identical either way, so deferral
bought no optionality — it only delayed the pilot that produces real
numbers.

### Build our own WebRTC/media layer

Rejected without much ceremony. Daily's hosted media plus an open-source
pipeline framework is the entire reason the lift is a pilot, not a platform
build.

## Consequences

- The conversation layer gets smaller: the cascade, its copy branches, and
  their per-branch tests are deleted in favor of one guard layer with
  invariant tests that hold across all intents.
- A second runtime (Python) enters the deploy pipeline for the bot process;
  the droplet's capacity guardrails from ADR 0001 apply to it.
- "Reviewed before spoken" survives as per-utterance buffered review; any
  future proposal to stream unreviewed tokens to TTS must revisit this ADR
  explicitly.
- The eval suite pivots from enum-branch coverage to experience-level
  trajectory assertions (novelty, acknowledgment, boundary-holding,
  latency), which is what the product actually promises.
- Cost per call shifts from per-token-only to per-minute (Daily) plus
  per-token; the pilot exists to measure the real crossover before
  production commitment. HITL requirements (live listen-in, human takeover)
  become natively possible — a human can join the Daily room — and are
  scoped in the pilot, not assumed.
- A companion refactor issue tracks step 1: dependency-inverting the
  conversation policy out of the state machine, cleaning the test suite,
  and landing tests that verify the target experience rather than enum
  branches.

## Pilot evidence (2026-08-05)

The staging implementation uses one Pipecat image in two bounded processes:
self-hosted SmallWebRTC by default and Daily under an authenticated `/daily/`
path. Both session-start paths passed on the DigitalOcean host. This does not
reverse the Daily decision; it keeps the pilot usable before production
promotion and makes transport a deployment choice instead of a
conversation-policy fork.

Netlify remains the only review authority. The worker sends final transcript,
history, and bounded state to the authenticated control plane, and speech is
released only after a `reviewed: true` response. The worker binds to loopback
behind Caddy, and provider credentials never enter browser responses. Full
microphone, interruption, multi-turn trajectory, and latency evidence is still
required before promotion.
