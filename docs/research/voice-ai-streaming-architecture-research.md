# Voice AI architecture research: REST turn-based (Maya) vs. Daily+Pipecat streaming

Status: research draft for architecture/strategy decision
Date: 2026-08-04
Author: research pass for ChaiWithJai/llamatutor `/mental-health` (Maya) voice receptionist demo

## 0. Grounding: what Maya actually is today

This section is drawn directly from the current implementation (branch `pr-72-review`,
which carries the mental-health/Maya work; it is not present on `main` or on the
active `feat/carousel-wolfram-drilldown` branch). Key files:

- `app/api/mental-health/respond/route.ts` — the harness
- `app/api/mental-health/speech/route.ts` — TTS proxy
- `app/api/mental-health/transcribe/route.ts` — STT proxy
- `components/MentalHealthDemo.tsx` — client call loop
- `utils/receptionConversation.ts` — deterministic state machine for the receptionist persona
- `utils/reviewedSpeechGrant.ts` — HMAC-signed grant that authorizes exactly one piece of server-approved text for speech
- `docs/mental-health-mode-prd.md`, `docs/adr/0005-experimental-reflection-safety-harness.md`

**Transport shape.** This is a browser push-to-talk demo, not real telephony. There
is no phone number, no Twilio/LiveKit/WebRTC session, and the PRD explicitly rules
that out for this slice ("Netlify serves the complete demo. No phone number,
Twilio/LiveKit connection, DigitalOcean worker, microphone permission, or raw audio
transport is needed" for the scripted path; the live caller seat adds mic capture
but still over plain HTTP POST, not a real-time media channel).

**Per-turn flow (live caller seat).**
1. Browser records a caller turn (MediaRecorder, push-to-talk) and POSTs the clip to
   `/api/mental-health/transcribe` → Together `openai/whisper-large-v3` → one final
   transcript string back (batch STT, not streaming partials).
2. Browser POSTs `{ mode: "caller", message, history, conversationState, ... }` to
   `/api/mental-health/respond`, which runs `runLiveHarness()`:
   - **Call 1 — assess**: `assessMentalHealthInput()` sends the bounded transcript to
     Together (`Qwen/Qwen3.5-9B` by default) with a JSON-schema response format,
     classifying `route` (`routine`/`elevated`/`urgent`), `confidence`, `abstain`.
   - **Application routing**: pure server code (`deriveMentalHealthRoute`) turns the
     assessment into a route decision. If `route === "urgent"` or `abstain`, the
     model never gets to generate free text at all — a reviewed static reply is
     substituted immediately (0 additional LLM calls).
   - **Call 2 — generate** (only on `routine`/`elevated`): a second Together call
     drafts a candidate response, constrained by a deterministic conversation-state
     machine (`receptionConversation.ts`) that the *application* computes first —
     the model is told "write only from this state," not asked to decide the state.
   - **Call 3 — review**: `reviewMentalHealthOutput()` sends the *complete* candidate
     back to Together for an approve/reject + violation-taxonomy classification,
     with a hard `confidence >= 0.72` floor.
   - Only if both the content reviewer approves **and** a local, non-LLM coherence
     check (`receptionistReplyIsCoherent`) passes does the candidate reach the
     caller. Otherwise a reviewed fallback string (never model-authored) is used.
   - The response is signed into a short-lived (5 min), HMAC'd `speechGrant`
     (`utils/reviewedSpeechGrant.ts`) — the *only* way arbitrary text can ever reach
     the TTS endpoint; scripted demo turns use an allowlisted `scenarioId+turnIndex`
     instead.
3. Browser POSTs the grant to `/api/mental-health/speech` → Together TTS
   (`cartesia/sonic-2`) → complete MP3 buffered and played back client-side once
   loaded.

So a single caller turn is **1 STT round trip + up to 3 sequential blocking LLM
round trips + 1 TTS round trip**, all over discrete HTTP POSTs, with the entire
candidate response generated, reviewed, and only *then* rendered/spoken. Nothing
streams token-by-token or audio-chunk-by-chunk to the caller; the UI's "processing"
phase is the visible cost of this buffer-then-review sequence.

**Why this shape exists (ADR 0005 / PRD).** The safety contract is stated
explicitly as load-bearing: *"validate structured input, let application code
route, generate only when permitted, buffer the candidate, approve the complete
output, and then reveal or speak it. Abstention and failure select reviewed
conservative content."* The PRD's route table forbids any commercial CTA or
"continue coaching" behavior once risk is flagged, and states flatly: *"Unchecked
generated text never enters the UI or audio queue."* The `/speech` route's own
comment underscores this: it "speaks application-owned text only... Neither lets a
browser choose what the branded voice says." This buffer-then-review pattern, not
the REST transport per se, is the actual safety mechanism.

## 1. Boardy.ai research

**Bottom line: this is thin. Positioning and funding are well documented; the
technical architecture almost entirely is not.**

### Positioning and product mechanics

Boardy is an AI "super-connector" for professional networking, founded by Andrew
D'Souza (previously co-founder/CEO of Clearco), with co-founders Matt Stein, Shen
Sivananthan, Ankur Boyed, and Abhinav Boyed. A user gives Boardy their phone number
(often via LinkedIn DM or the boardy.ai site). Boardy calls them with a voice AI
persona, has a natural conversation about what the person needs (fundraising,
hiring, customers, co-founders, expert sourcing, accelerator placement, etc.),
cross-references its network, and — if it finds a match it judges both relevant and
likely to "get along" — facilitates a **double-opt-in email introduction** (both
sides must agree before being connected). D'Souza frames it explicitly as an
independent agent rather than a command-following tool ("You can't tell Boardy what
to do, which is what makes him more trustworthy"). Reported mid-2026 scale: 166,000+
people spoken with, 114,000+ introductions made.

Sources: [TechCrunch pre-seed](https://techcrunch.com/2024/10/24/ai-networking-startup-boardy-raises-3m-pre-seed/),
[TechCrunch seed](https://techcrunch.com/2025/01/14/boardy-ai-raises-8m-seed-round-months-after-closing-pre-seed/),
[Creandum: Backing Boardy](https://creandum.com/stories/backing-boardy-ai/)

### Funding

- Pre-seed: $3M, October 2024, led by HF0, with 8VC, Precursor, Afore, FJ Labs, NextView.
- Seed: $8M, January 2025, led by Creandum, with angels including Andy Dunn and Leah Solivan.
- No Sequoia-led round found in public sources — worth flagging that "Sequoia-backed"
  (as sometimes assumed) is not corroborated by anything found here; HF0 and
  Creandum are the disclosed leads.
- A recurring anecdote (Creandum's own blog post): several seed investors say they
  experienced the product by being called by Boardy before ever seeing a pitch deck
  or talking to the human team.

### Technical stack / architecture

The one concrete, sourced fact is from **Boardy's own privacy policy**
(boardy.ai/privacy-policy, fetched directly): *"We use OpenAI and Anthropic to
power our AI capabilities,"* processing "conversations, profile information, call
transcripts, calendar event details, and derived calendar insights." That confirms
both providers are used somewhere in the pipeline, but not which does what (e.g.
live conversation vs. matching/reasoning), and discloses **no** telephony/voice
vendor (no confirmed Twilio, Vapi, Bland, Retell, or Daily/Pipecat mention
anywhere), no STT/TTS provider, and no latency figures. A secondary podcast
writeup (not a primary transcript) loosely describes the approach as engineered
around "latency, memory, and context limits" and mentions a proprietary corpus of
~50,000 human conversations used for matchmaking tuning, plus an "ex-actor" used for
prompt/tone engineering — treat this as low-confidence color, not documented
architecture.

### Safety/moderation

Not publicly documented at all. No blog post, interview, or policy language
describes content moderation, abuse prevention, or guardrail design in the voice
pipeline. The closest thing to a stated safety mechanism is the double-opt-in
introduction design — a product/trust feature, not a technical content-safety
guardrail.

### Honest assessment

Well documented: funding rounds, founding team, product mechanics, positioning,
directional usage metrics — all from TechCrunch/VC blog posts and several
business-press podcast interviews with the CEO. Essentially undocumented: any
system architecture, model routing, telephony/voice infra choice, latency
engineering, or safety/moderation design. There is no engineering blog, no
conference talk, and no primary-source interview with a Boardy engineer that this
research surfaced. Boardy is a useful example of positioning and go-to-market for
an AI voice-calling product, but it is **not a source of transferable architecture
guidance** for this decision — anything more specific than "OpenAI + Anthropic
power it somewhere" would be speculation.

## 2. Daily.co + Pipecat deep research

### Daily's core WebRTC platform

Daily is built around **rooms** (persistent virtual spaces, created/configured via
REST API) that host **sessions** (individual calls); participants publish their own
audio/video and subscribe to others' — a standard SFU (Selective Forwarding Unit)
model, so each participant only needs ~200 kbps upstream regardless of call size.
Daily describes its topology as a **"mesh SFU"**: every Daily media server
worldwide is interconnected via backbone links, so distant participants connect to
their nearest server and traffic routes server-to-server rather than hairpinning
across the public internet.
([docs](https://docs.daily.co/docs/guides/architecture-and-monitoring/intro-to-video-arch),
[mesh network post](https://dev.to/trydaily/dailys-global-mesh-network-48d1))

Latency claims: media clusters in **10 regions / 30 network availability zones**,
targeting **≤50ms first-hop** for 5B people and **sub-200ms** real-time
conversational latency; an example transatlantic (London↔SF) one-way figure is
**~80ms**. I could not find a published round-trip audio latency number
specifically, only these one-way/first-hop figures — flagged as a gap, not a
confirmed round-trip claim.

**Pricing** (from daily.co/pricing, current as fetched): first 10,000
participant-minutes/month free; then **$0.004/participant-minute** for
video/audio, graduating to $0.0015/participant-minute at 50M+ minutes/month;
audio-only calls run $0.00036–$0.00099/participant-minute. Add-ons relevant to a
voice product: realtime transcription $0.0059/unmuted participant-minute,
post-call transcription $0.0043/min, SIP dial-in/out $0.003–$0.02/min, PSTN
dial-in/out $0.018–$0.03/min, dedicated phone numbers $2/month, HIPAA/BAA add-on
$500/mo.

### Pipecat: pipeline structure

Pipecat is Daily's **open-source (BSD-2-Clause)** Python framework for real-time
voice/multimodal agent pipelines. Core abstraction: **Pipeline → FrameProcessors →
Frames** — typed units (audio/text/image/control) flow through a sequence of
processor stages; a `DailyTransport` processor sits at each edge to bridge a
Pipecat pipeline into a Daily WebRTC room.
([GitHub](https://github.com/pipecat-ai/pipecat),
[frame-processor docs](https://docs.pipecat.ai/pipecat/fundamentals/custom-frame-processor))

- **VAD/turn detection**: integrates **Silero VAD** locally for low-latency
  speech-activity detection, opening the caller's turn on the VAD signal itself
  rather than waiting on a first STT token — important for responsive barge-in.
- **Streaming STT/LLM/TTS**: broad first-party integration surface — 20+ STT
  providers (Deepgram, AssemblyAI, Whisper, etc.), most major LLM providers with
  token streaming (OpenAI, Anthropic, Groq, etc.), 18+ TTS providers (ElevenLabs,
  Cartesia, etc.) — all wired for streaming rather than batch calls.
- **Interruption/barge-in**: a `BaseInterruptionStrategy` abstraction lets you
  choose how a user is allowed to interrupt the bot mid-speech (audio-volume
  based or word-count based); on trigger, in-flight TTS/LLM generation is cut and
  the new user utterance takes over. This is a first-class, documented mechanism
  — not a bolt-on.
- **Composability**: custom `FrameProcessor` subclasses insert into the pipeline
  like any built-in stage; this is well-documented and is the extension point
  that matters for this decision (see safety discussion below).
- **Self-hosting**: modest compute — Pipecat's own Fly.io deployment guide
  suggests 1 shared CPU / 512MB–1GB RAM per agent session is workable, no GPU
  required for the orchestration server itself (GPU only needed if
  self-hosting STT/TTS/LLM rather than calling hosted APIs).
- **Pipecat Cloud** (Daily's managed hosting): usage-based compute tiers —
  agent-1x (0.5 vCPU/1GB): $0.01/min active, $0.0005/min reserved; agent-2x:
  $0.02/$0.001; agent-3x: $0.03/$0.0015. 10,000 free minutes/month. Third-party
  AI provider costs (STT/LLM/TTS) are billed separately by those providers.

### Safety/moderation in a streaming pipeline — the crux

This is the most consequential and least well-documented area, and deserves the
most caution.

**What's confirmed**: Pipecat buffers streaming LLM tokens until a **sentence
boundary** before handing text to TTS (`SimpleTextAggregator`, described as "the
default aggregator used by most TTS services... buffers incoming text until
sentence boundaries are detected"). This exists **purely for prosody/TTS-quality
reasons** — avoiding choppy, fragment-by-fragment speech — and Pipecat's own
documentation makes no mention of moderation or content-filtering as a motivation
for this buffer.

**What's structurally true but not shipped**: that sentence-boundary buffer *is* a
natural checkpoint — you already have a complete sentence accumulated in memory
before it's handed to TTS, which is exactly the kind of unit a content classifier
could run against. But **no first-party Pipecat component does this**. Targeted
search of Pipecat's GitHub org, docs, and API reference for "moderation,"
"guardrail," or "safety processor" turned up nothing built-in. One third-party
integration pattern was found referencing a vendor product ("Future AGI
Protect/ProtectFlash," a sub-100–500ms inline classifier positioned as a custom
FrameProcessor between LLM and TTS) but this could not be independently verified
against Pipecat's own docs/GitHub and should be treated as low-confidence,
not a proven production pattern.

**The actual trade-off, stated plainly**: Pipecat's default posture is to stream
LLM output into TTS sentence-by-sentence as it's generated — which is the opposite
of "buffer the complete candidate, review it, then speak it." Nothing in Pipecat
stops you from building a stricter pipeline (accumulate the *entire* response,
run it through a review step, only then release it to TTS — effectively disabling
the incremental-streaming benefit for the response leg while keeping streaming
STT/VAD for input), but that is work you would have to build and own; it is not
what the framework does by default, and it is not a documented, community-proven
pattern the way the sentence-aggregator or interruption-strategy mechanisms are.
The general LLM-safety industry offers named patterns for this tension
(parallel/rolling-window classifiers, guarded streaming with a kill-switch — e.g.
OpenAI's `openai-guardrails-python`, NVIDIA NeMo Guardrails) but these are general
LLM-safety projects, not voice-pipeline-specific or Pipecat-affiliated, and none
were found wired into a real Pipecat production example.

### Licensing/cost

Pipecat: BSD-2-Clause, free commercial use, no copyleft. Self-hosted compute is
cheap at low volume (illustrative Fly.io reference: roughly $2–$34/month for a
single small always-on instance, general pricing research not Pipecat-specific).
Pipecat Cloud is usage-based per the tiers above, with third-party AI provider
costs always billed separately regardless of which hosting path is chosen.

### What could not be confirmed

Daily's specific audio codec (Opus is the WebRTC standard default and highly
likely, but not confirmed in Daily's own fetched docs); precise round-trip (vs.
one-way) latency figures; and — most importantly for this report — any
authoritative, production-proven example of a moderation/review gate inserted
into a Pipecat pipeline before TTS. That last gap is treated as a real finding in
§3 below, not a research shortfall to paper over.

## 3. Architecture comparison

| Dimension | Current: REST turn-based, buffer-then-review | Daily + Pipecat: streaming |
|---|---|---|
| **Perceived latency/naturalness** | Each turn pays for a full round trip: STT batch call → up to 3 sequential blocking LLM calls → TTS batch call, all before any audio plays. The client's "checking before speaking" phase is directly visible dead air. This is the single biggest UX gap vs. a phone call. | VAD-based turn detection opens the caller's turn immediately on speech; streaming STT, streaming LLM tokens, and streaming TTS overlap so the bot can start speaking within a sub-second budget; first-class barge-in lets the caller interrupt naturally. This is a materially more natural call experience — the actual reason to consider this move. |
| **Engineering complexity to build/maintain** | Low incremental complexity today: Next.js API routes, no session/room concept, no persistent server, reuses existing hosting. The state machine (`receptionConversation.ts`) is already nontrivial but it's ordinary application code. | New categories of complexity: a persistent Pipecat process/service (even if small), WebRTC session lifecycle, VAD tuning, interruption-strategy tuning, frame-processor composition, and — critically — a *custom* safety-review processor that does not exist off the shelf (see below). This is a real new subsystem to build and operate, not a drop-in swap. |
| **Cost structure** | Pure variable cost, no infra floor: ~$0.10–$0.45/call today (STT+TTS-dominated; the 3 LLM calls are cheap because they're short/small-model). Scales linearly; nothing to pay for at zero calls. | Variable provider cost is comparable-to-somewhat-higher per call (~$0.15–$0.60), *plus* a **new fixed cost floor** (~$20–$150/mo) to keep a Pipecat runtime available, whether or not calls are happening. At the volumes in this brief (100–1,000 calls/week) the current architecture is cheaper or comparable; the streaming approach's cost story only clearly improves at much higher volume. |
| **Compatibility with a hard pre-speech safety review gate** | **This is what the architecture is built for.** The entire harness is designed around buffering a complete candidate and only exposing/speaking it after both a model-based reviewer and a deterministic state-coherence check approve it. Abstention and failure default to reviewed, non-model text. Nothing generated can reach the caller unreviewed — this is enforced structurally (the `/speech` endpoint only accepts allowlisted scripts or signed grants for text the server itself already approved), not just by convention. | **Fundamentally in tension by default.** Pipecat's default posture streams LLM tokens into TTS at sentence granularity as they're generated, specifically *for* low latency — the opposite goal of "review the complete output before it can be heard." No first-party Pipecat component does pre-TTS content review; this would have to be built as a custom `FrameProcessor`, and building it well means either (a) accepting the latency cost of buffering full/near-full responses before TTS — which gives away most of the "naturalness" benefit that motivated the move in the first place — or (b) accepting a materially weaker guarantee (rolling-window or parallel classification with a kill-switch that can cut TTS mid-utterance, meaning the caller may hear a few words of unreviewed content before a cutoff lands). |

### What would have to change to move to streaming without weakening "reviewed before spoken"

This is the part that matters most and is worth stating precisely, because the
transport layer is not the hard part — the safety design is.

1. **Decide, explicitly, which guarantee you're actually willing to give up.**
   Today's guarantee is *zero* unreviewed tokens ever reach the caller. A
   streaming architecture can preserve that guarantee only by **not** streaming
   the safety-relevant leg — i.e., still buffer the full candidate response,
   still run it through `reviewMentalHealthOutput()` (or an equivalent), and only
   *then* release it to TTS, exactly as today, even though everything else in the
   pipeline (STT, VAD, transport) is streaming. This gets you faster turn-taking
   and better barge-in on the *input* side, and a fixed no-worse-than-today
   latency on the *output* side — a legitimate, non-weakening hybrid. If instead
   you allow sentence-level or token-level streaming into TTS before review
   completes, you are giving up the "nothing unchecked reaches the caller"
   invariant and replacing it with "unchecked content can be heard for up to N
   words/ms before a kill-switch can act" — a materially different, weaker
   safety property that would need its own sign-off, not an assumed equivalence.

2. **Build a custom pre-TTS review FrameProcessor.** Pipecat gives you the
   extension point (custom `FrameProcessor`s compose cleanly) but not the
   component. This processor needs to: accumulate the full candidate text (or a
   configurable unit — full response for maximum safety, or clause/sentence for
   partial streaming with a documented risk trade), run the same input/output
   review logic the current harness runs (ideally the *same* Together calls,
   reused rather than reimplemented), and only forward frames to the TTS stage
   on approval — falling back to reviewed static text on rejection, abstention,
   or timeout, exactly as `runLiveHarness()` does today.

3. **Re-derive the application-owned routing/state-machine logic inside the
   streaming pipeline.** The receptionist's conversation-state machine
   (`receptionConversation.ts`) is pure application code that runs *before* the
   model drafts anything, and a local coherence checker
   (`receptionistReplyIsCoherent`) that runs *after*. Both of these need to exist
   as pipeline stages (or be called from a custom processor) in the streaming
   architecture — they are not something Pipecat provides, and they are not
   safe to drop just because the transport changed.

4. **Re-establish the "server owns what can be spoken" invariant for the new
   transport.** Today this is enforced by `reviewedSpeechGrant.ts` — an HMAC-signed
   grant that is the only way arbitrary text reaches `/speech`. In a Daily/Pipecat
   world, the equivalent is: only the reviewed-and-approved processor output may
   be handed to the TTS frame processor; the LLM's raw draft frames must never be
   wired directly to a TTS service instance. This is an architectural discipline
   to enforce in pipeline wiring, not a config flag — it is easy to accidentally
   wire the LLM service directly to TTS (that's the Pipecat "quickstart" default)
   and lose the guarantee without realizing it.

5. **Decide what "urgent route" cutoff looks like in a live audio stream.**
   Today, an urgent classification prevents generation entirely before anything
   is drafted. In a streaming architecture, if any part of the response pipeline
   is allowed to stream before full review (even just VAD/STT on the input side
   feeding a "would this be urgent" pre-classifier), you need a defined, tested
   behavior for what happens to in-flight bot audio when a caller's *input*
   turns out to require the urgent branch mid-turn — not just before the bot's
   own output.

6. **Accept the latency cost this reintroduces, and be honest about it in the
   product story.** A hybrid that buffers the full response before TTS gets back
   most of the current architecture's "processing" pause on the output side —
   you gain faster/cleaner turn-taking and barge-in on the input side, but you do
   not get the fully overlapped, sentence-streamed naturalness that's Pipecat's
   headline benefit, because that benefit is specifically what you're choosing
   not to take in order to keep the review gate intact.

The net finding: **a hard pre-speech review gate and Pipecat's default streaming
posture are not compatible out of the box; they can be made compatible only by
deliberately not streaming the safety-relevant leg of the pipeline**, which
captures roughly half of Pipecat's latency benefit (input/turn-taking) while
giving up the other half (output naturalness) — a real, bounded improvement over
today, not the fully "instant, natural" streaming experience that Daily/Pipecat
marketing and demos showcase.

## 4. Cost investment estimate

**All figures below are order-of-magnitude estimates from publicly listed provider
pricing, not a bill. They are meant to show which architecture wins on unit
economics at which volume, not to be exact.** Assumptions stated explicitly.

### Shared call-volume assumptions

- Average call: **3.5 minutes**, **~10 caller turns** (consistent with the PRD's
  "at least eight alternating turns" for a routine call, plus a greeting/goodbye).
- Two volume tiers: **100 calls/week** (~433/month) and **1,000 calls/week**
  (~4,333/month).
- Both architectures use a small/fast LLM for the safety-classification and review
  steps (that part of the design should not change), and a mid-tier LLM for the
  generation step.

### (a) Current architecture: turn-based REST on Together AI

Per turn, the harness makes up to 3 Together chat-completion calls (assess,
generate, review — 2 of the 3 are skipped whenever `route === "urgent"` or the
classifier abstains, so 3 is a ceiling, not an average; call it **~2.5 LLM calls
per turn** blended). Each call is short: a few hundred input tokens (system prompt
+ bounded transcript) and a `max_tokens: 500` cap on output, so call these
~600 input / ~150 output tokens each in practice.

- **LLM (Together, small model ~9B class)**: at illustrative small-model list
  pricing (roughly $0.1–$0.3 per 1M tokens on Together's smaller open models),
  10 turns × 2.5 calls × ~750 tokens ≈ **~19K tokens/call**, i.e. a few cents of
  LLM spend per call — this leg is close to negligible at either volume tier.
- **STT (Together, Whisper-large-v3)**: billed per audio minute; call it
  **~$0.02–$0.06/minute** in the range published by comparable Whisper-class
  hosted endpoints. At ~1.5 min of caller audio per 3.5-min call, that's roughly
  **$0.03–$0.09/call**.
- **TTS (Together, Cartesia Sonic-2)**: character- or minute-billed; Cartesia-class
  hosted TTS commonly runs in the **~$0.03–$0.15/minute-of-audio-generated**
  range. At ~2 min of receptionist speech per call, roughly **$0.06–$0.30/call**.
- **Compute/hosting**: Netlify functions, effectively **$0** marginal (within
  existing hosting plan) at this volume — no dedicated real-time media server to
  run.

**Rough per-call cost: ~$0.10–$0.45**, dominated by STT+TTS, not the 3 sequential
LLM calls (which are cheap because they're short, structured, small-model calls).

| Volume | Calls/mo | Est. monthly cost |
|---|---|---|
| 100 calls/week | ~433 | **~$45–$195/mo** |
| 1,000 calls/week | ~4,333 | **~$450–$1,950/mo** |

Cost scales ~linearly with call volume; there is no fixed real-time infra floor to
amortize, which is the point of this architecture at low volume — you pay per unit
of provider usage and nothing else.

### (b) Daily + Pipecat streaming architecture

- **Daily WebRTC transport**: Daily's per-minute pricing for its programmable video
  platform runs in the neighborhood of **$0.004/participant-minute** for standard
  audio/video, with the caller and the bot each metered as a participant in the
  room — call it **~$0.008/minute of call** (2 participant-legs) as a rough floor;
  Daily also publishes free-tier minutes that would cover very low volume at $0.
  *(Confirm against current daily.co/pricing before committing to a number — this
  changes over time and by product line.)*
- **Streaming STT** (e.g. Deepgram-class): commonly **~$0.004–$0.006/minute** for
  streaming transcription — cheaper per minute than a batch Whisper call because
  it's optimized/committed-volume pricing, but billed continuously for the whole
  call rather than just the caller's speaking time.
- **Streaming TTS** (e.g. ElevenLabs/Cartesia streaming): commonly
  **~$0.05–$0.25/minute-of-audio-equivalent** depending on plan tier and voice
  quality — often *more* expensive per minute at low committed volume than a
  batch TTS call, because premium low-latency streaming voices carry a latency/
  quality premium.
- **LLM tokens**: comparable-or-higher than (a) per token, because low-latency
  conversational streaming pushes toward a faster (often pricier per-token, e.g.
  a hosted frontier-adjacent model or a low-latency inference provider like Groq)
  model for the generation leg to keep time-to-first-token low; the
  classification/review legs can stay on the same cheap small model as (a).
- **Compute to run Pipecat**: Pipecat itself is a self-hosted Python process (open
  source; see §2) — you need a small persistent server or container (even at 100
  calls/week this is realistically a **~$20–$100/mo** floor for a small always-on
  instance, or usage-billed if run on serverless GPU/CPU with cold-start
  penalties that hurt latency, which cuts against the whole point of going
  streaming). This is the structurally new cost line versus (a): a **fixed
  infrastructure floor** that exists even before the first call, and that a
  turn-based Next.js API route running on existing hosting does not have.

**Rough per-call cost: ~$0.15–$0.60** in provider fees alone, **plus** a
$20–$150/mo fixed hosting floor for the Pipecat runtime that doesn't disappear at
low volume.

| Volume | Calls/mo | Est. variable cost | Est. fixed infra | Est. total |
|---|---|---|---|---|
| 100 calls/week | ~433 | ~$65–$260/mo | ~$20–$100/mo | **~$85–$360/mo** |
| 1,000 calls/week | ~4,333 | ~$650–$2,600/mo | ~$50–$150/mo (may need to scale up) | **~$700–$2,750/mo** |

### Honest read on unit economics

At **both** tiers examined here, the current Together-based REST architecture is
cheaper or comparable — the streaming architecture doesn't clearly win on cost at
either 100/week or 1,000/week; it wins on *latency/naturalness*, not economics.
The gap that would flip this is very high volume (tens of thousands of
calls/week), where Daily/Pipecat's per-minute pricing and self-hosted compute
amortize better than paying full retail per-call rates to a hosted inference
platform, and where a dedicated always-on Pipecat fleet's fixed cost becomes
trivial relative to variable spend. At the volumes in this brief, the fixed
infrastructure floor of running Pipecat is the more decision-relevant number than
the marginal per-minute deltas — it's a new, non-zero cost at 100 calls/week that
the current architecture simply does not have.

## 5. HITL requirements

The product's boundary language already promises a human handoff. From
`receptionConversation.ts`, the reviewed fallback copy for `nextAction: "handoff"`
says things like: *"Nothing is booked or saved; a practice staff member would need
to continue from here"* — for procedures, billing/insurance, emotional-support
disclosure, and any caller objection to closing. Today this is **entirely a
scripted sentence**. There is no code path, queue, notification, or human seat that
actually does anything when that sentence is spoken — the call simply ends. That
gap is the central HITL question for either architecture.

### What "operationally real" would require, by architecture

**A. Async review queue for borderline calls (lowest lift, works with either
architecture)**
- Persist a structured record — not raw transcript by default, given the PRD's "no
  raw public-demo text in logs/storage" data contract, so this itself is a policy
  change — for any call where `route !== "routine"` or `nextAction === "handoff"`.
- A queue/table (e.g. Postgres row, or a Slack/webhook notification) a staff member
  can look at within some SLA (minutes to hours, not real time).
- This requires: (1) a decision to start retaining route + reason + minimal
  redacted context for handoff calls (a real privacy/retention decision the PRD
  currently defers — "Privacy, retention, consent, incident, and kill-switch
  ownership for any future real calls" is listed as an explicitly gated, unresolved
  decision); (2) a staff-facing surface (even a shared inbox) to actually see and
  act on it; (3) some caller-facing promise about *when* they'll hear back, since
  today's copy implies immediacy ("a practice staff member would need to continue
  from here") but an async queue does not deliver that in-call.
- This is buildable on the current REST architecture with no transport change at
  all — it's a server-side side effect added to the existing `handoff` branch in
  `respond/route.ts`. It is the cheapest way to make the sentence non-fictional.

**B. Live listen-in / whisper-coaching (human hears the call, can coach the AI or
the caller quietly)**
- Requires a real-time media channel a human can join mid-call: a WebRTC room
  (Daily-style) with the human as a silent/whisper participant, or a phone
  conference bridge (Twilio) with a coaching leg. The current architecture has no
  session concept at all — every turn is a stateless POST; there is nothing to
  "join." This capability is effectively unavailable without first adopting some
  real-time media layer (Daily/Twilio/LiveKit), regardless of whether the AI
  pipeline itself is streaming or turn-based.
- Also requires an operational layer entirely outside this codebase: staffing,
  presence/availability tracking, and a UI for the human (mute state, whisper vs.
  barge, call metadata).

**C. Real-time takeover / full barge-in by a human agent (human can silently take
the call from the AI)**
- Superset of (B): needs the same live media channel, plus a control-plane action
  that atomically swaps "who is generating the next turn" from the LLM harness to a
  human operator UI, plus continuity of the transcript/state (`conversationState`)
  so the human isn't starting cold.
- On a Daily/Pipecat-style pipeline this maps naturally onto Pipecat's pipeline
  composability — a "human-in-the-loop processor" can pause bot generation and pipe
  a human's own mic into the room instead. This is a documented pattern in
  Pipecat-adjacent voice AI products (see §2), though it is custom application
  logic, not an off-the-shelf toggle.
- On the current turn-based REST architecture, this is much harder to retrofit
  cleanly: there's no persistent session to "take over" mid-flight, no live audio
  path to insert a human into, and the caller-facing UI is a single browser tab
  with no notion of a second participant. You would effectively be building the
  real-time media layer from B first.

**D. Human approval gates before certain actions** (already partially present in
spirit) — the harness's `reviewMentalHealthOutput()` step is a *machine* approval
gate before speech. A human approval gate (e.g., a staff member must confirm before
an appointment is actually booked, before urgent-route resources are read out
verbatim, etc.) is orthogonal to transport: it can be sync ("hold, let me check,"
which needs a live channel to keep the caller on hold intelligibly) or async
("we'll confirm by text," which any architecture can do). Given this demo never
actually books anything (`DEMO_SLOTS` are fake, nothing is persisted), this gate is
currently moot — but it becomes real the moment "nothing is booked or saved"
becomes "something is booked."

### Minimum surface to make the existing promise real

The cheapest way to convert *"a practice staff member would need to continue from
here"* from a scripted sentence into an operational guarantee, without any
transport change: implement (A) — persist a handoff record with route/reason/turn
context whenever `nextAction === "handoff"`, put it in front of a real human within
a stated SLA, and change the in-call copy to match reality (e.g., "we'll follow up"
rather than implying in-call continuation). This requires zero streaming
infrastructure. Live listen-in or takeover (B/C) — the versions that would make the
in-call promise literally true in real time — require adopting a real-time media
layer first; they are not implementable as HTTP POSTs no matter how the LLM calls
are structured.

## Recommendation

**Stay REST/turn-based for now; treat a Daily/Pipecat streaming rearchitecture as
a deliberate, safety-design-first project to pick up later, not a near-term
transport upgrade.** A hybrid is the right target state eventually, but it should
not be scoped as "swap the transport" — it's "redesign the safety gate to survive
a different transport," which is a bigger project than it looks.

**Why not now:**

1. **The safety gate is the product's whole claim, and streaming's default
   posture is structurally opposed to it.** Pipecat's documented default is to
   push LLM tokens into TTS at sentence granularity as they're generated — that is
   the opposite of "buffer, review, then speak." Nothing in Pipecat ships a
   pre-TTS moderation/review component; it would have to be built from scratch as
   a custom `FrameProcessor`, and doing it *without* weakening today's "zero
   unreviewed tokens reach the caller" guarantee means deliberately not
   streaming the response leg — which gives up roughly half of the latency
   benefit that would justify the migration in the first place (see §3).
2. **Cost doesn't push you there either at current or near-term volume.** At both
   100/week and 1,000/week, the current Together-based REST architecture is
   cheaper or comparable (§4) — the streaming path adds a new fixed
   infrastructure floor (a persistent Pipecat runtime, ~$20–150/mo) that doesn't
   exist today and doesn't pay for itself until volume is much higher than
   anything in this brief.
3. **Boardy.ai offers no transferable architecture lesson here.** It's a useful
   comparable for *positioning* (independent-feeling AI agent, phone-first,
   double-opt-in trust mechanism) but its technical stack is essentially
   undocumented publicly — nothing to borrow or benchmark against for this
   decision (§1).
4. **The HITL promise the product already makes ("a practice staff member would
   need to continue from here") is currently fictional regardless of transport,
   and the cheapest fix doesn't require streaming at all.** An async
   handoff-record + staff queue (§5, option A) makes that sentence operationally
   true with zero transport changes. Live listen-in or human takeover — the
   versions that would make it true *in the moment* — do require a real-time
   media layer, but that's a reason to sequence HITL work *before* or *alongside*
   any streaming migration, not a reason to migrate on its own.

**Why not "never," either:** the latency/naturalness gap is real and is the
correct long-term reason to move — turn-based REST with three sequential
blocking LLM calls per turn will always feel like a form-filling app pretending
to be a phone call, and that gap won't close by optimizing the current
architecture harder. If/when (a) call volume grows enough that Pipecat's
per-minute economics stop being a net cost adder, or (b) the product needs live
human takeover/listen-in as a real feature (not just a promised sentence) and
therefore needs a real-time media layer anyway, that's the trigger to revisit —
and at that point the right first deliverable is not "add Daily," it's "design
and build the custom pre-TTS review FrameProcessor and prove it holds the same
safety invariants as `runLiveHarness()` today, in isolation, before wiring it
into a live room." Do that safety-gate redesign as its own workstream with its
own sign-off, independent of the transport migration — conflating the two is
the likeliest way this goes wrong.

**Hybrid framing for whenever that trigger arrives:** keep VAD/streaming-STT/
streaming-transport on the input side (real latency and naturalness win, low
safety risk since caller input isn't what's being spoken aloud), but keep the
response leg buffer-then-review exactly as strict as it is today (full candidate,
full review, only then TTS) — accepting that this leaves the bot's own turn-taking
no faster than today, in exchange for not weakening the one guarantee the whole
product is built on.
