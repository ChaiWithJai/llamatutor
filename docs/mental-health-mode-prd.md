# Mental health mode: experimental product requirements

Status: implementation contract for a non-clinical, masterclass-ready experiment

This document replaces the pasted talk notes as the product contract. It does
not approve a clinical product. It translates the useful engineering pattern
from the Sonder talk—checks around a generative model plus a measurable review
loop—into an inspectable Dharmic Data Tutor experiment.

## Outcome

A visitor can open a separate **Mental health mode · experiment**, understand
its limits, try a synthetic scenario, and see how a safety harness checks the
input, chooses a route, prepares a response, and checks the output. The demo
should teach a transferable “sandwich the model” pattern and end with a clear,
content-free invitation to discuss building an AI voice receptionist.

The experiment is successful when a masterclass viewer can explain:

1. why application code, not the language model, owns routing;
2. why high-risk states use reviewed deterministic content;
3. why generated output is approved before it is revealed;
4. how traces become an evaluation set and release gate; and
5. which parts of the web control plane transfer to a voice channel.

## Positioning and scope

Use the product name **Reflection mode · experiment** in the interface. The
navigation may describe it as the mental-health safety-harness demo, but the
experience must never call itself a therapist, diagnose, recommend treatment,
promise monitoring, or claim clinical accuracy.

Initial scope:

- adult, US-oriented demonstration;
- synthetic scenarios by default, plus an explicitly acknowledged live lab;
- reflection and grounding language, not clinical advice;
- an inspectable three-route policy and four-stage harness;
- no sign-in, persistence, citations, microphone, outbound messages, or alerts;
- no claim that a human is watching or will intervene.

Out of scope until separate approval:

- unrestricted public mental-health conversations;
- minors, diagnosis, treatment, or medication guidance;
- automatic calls, texts, emergency dispatch, or clinician escalation;
- storing raw messages, clinical records, or inferred diagnoses;
- voice streaming or telephony in Netlify Functions;
- marketing claims about sensitivity, specificity, or clinical efficacy.

## Jobs to be done

| ID  | Visitor need                                                | Product response                                                                                           | Evidence of success                                                                   |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| MH1 | I want to understand the pattern quickly.                   | A calm introduction explains the four harness stages and the experiment boundary.                          | A visitor can enter a scenario without reading documentation.                         |
| MH2 | I want to see routing, not trust a black box.               | Each run shows input check, route, response policy, and output check with plain-language reasons.          | The selected route and fallback are visible without exposing hidden chain-of-thought. |
| MH3 | I want to compare ordinary, ambiguous, and urgent language. | Three reviewed synthetic scenarios exercise routine, elevated, and urgent routes.                          | Every scenario reaches its expected deterministic UI state.                           |
| MH4 | I want failure to be safe and legible.                      | Invalid or unavailable classification abstains into a conservative reviewed state.                         | Provider and parsing failures never reveal unchecked generated text.                  |
| MH5 | I want to know how this transfers to voice.                 | A short architecture note and CTA distinguish the reusable control plane from a long-running media worker. | The CTA records only the action, never scenario text.                                 |
| MH6 | I want control and an easy exit.                            | Persistent experiment label, Leave mode control, and non-blocking resource access remain available.        | Keyboard and mobile users can always leave or open resources.                         |

## Experience flow

### 1. Entry

The normal tutor remains the primary product. A small, explicit experimental
entry in the header opens `/mental-health`. The route is isolated from the
lesson state machine and coaching database.

### 2. Scope and consent

The first screen says that this is an educational prototype using synthetic
examples, not therapy or crisis monitoring. It names the US-only limitation,
states that no conversation is saved, and provides **Try the demo** and
**Return to Tutor** actions.

### 3. Scenario lab

The visitor chooses one of three hand-authored examples:

- **Routine stress:** ordinary reflection; expected route `routine`.
- **Ambiguous distress:** language that warrants acknowledgement and one
  clarifying safety question; expected route `elevated`.
- **Immediate danger:** explicit imminent-risk language; expected route
  `urgent`.

The examples are visibly labelled synthetic. A separate **Live lab** lets the
presenter enter free text after acknowledging that it is an engineering demo,
not support or crisis monitoring. Live input is sent transiently to Together,
is never saved, and always has a deterministic timeout/error fallback. The
guided scenario path remains available when credentials or the provider fail.

### 4. Harness trace

The page advances through four bounded stages:

1. **Input check** — policy result, confidence, and abstention state.
2. **Route** — application-owned `routine`, `elevated`, or `urgent` decision.
3. **Response** — the permitted response strategy for that route.
4. **Output check** — approval or replacement before any response appears.

The trace reports policy facts and timing. It does not expose hidden reasoning
or model chain-of-thought.

### 5. Result states

`routine` shows a short reviewed reflection prompt. `elevated` acknowledges the
language, asks one direct safety clarification, keeps resources available, and
lets the visitor mark the route as a false positive. `urgent` stops generative
coaching and shows reviewed US resources: call or text 988, call 911 for
immediate danger, contact a trusted person, or move to a safer place. The page
remains usable; it does not lock, terminate, call, text, or imply human presence.

### 6. Transfer to voice

After a completed synthetic run, an architectural card explains that the same
typed turn contract and routing policy can sit between speech recognition and
text-to-speech. The CTA is **Build a voice receptionist with this pattern**.

## Safety contract

The application owns the final route. A model may return a schema-constrained
assessment, but it cannot invoke arbitrary tools or select outbound actions.
The assessment contract contains:

```ts
type SafetyAssessment = {
  policyVersion: string;
  route: "routine" | "elevated" | "urgent";
  confidence: number;
  abstain: boolean;
  signals: string[];
};
```

Invalid JSON, an unknown enum, a timeout, low confidence, or provider failure
must produce `abstain: true`. The server then chooses a reviewed conservative
state. The UI never derives the route from model-authored prose.

The three guided scenario responses are reviewed, deterministic copy. The live
lab may generate a `routine` response and a narrowly bounded `elevated`
response so the presenter can demonstrate both guards. Generated text must be
buffered, evaluated, and then revealed; asynchronous review after streaming is
observability, not a guardrail. An `urgent` route, abstention, classifier
failure, or output rejection always uses reviewed deterministic copy.

## Data and observability

The public scenario lab is anonymous and ephemeral:

- do not write to Netlify Database or browser storage;
- do not send scenario text to Plausible, Helicone, logs, or the CTA;
- do not use Exa or live web results for crisis resources;
- log only content-free fields such as scenario ID, policy version, route,
  model alias, latency bucket, failure class, and synthetic flag;
- keep provider keys and routing policy server-side;
- maintain a feature kill switch independent of deployment.

Before any real text is accepted, approve consent copy, retention duration,
deletion behavior, trace access, incident ownership, and applicable state-law
requirements. HIPAA applicability is not assumed merely because content is
health-related; consumer-health privacy and unfair-practices obligations can
still apply.

## Architecture

### Web experiment

- Next.js route `/mental-health` renders the isolated scenario lab.
- A typed policy module owns scenario definitions, route permissions, reviewed
  fallback copy, and the demo trace contract.
- `/api/mental-health/respond` runs input assessment, application routing,
  bounded response generation when permitted, and output assessment in one
  non-streaming request. Together responses use structured JSON and Zod at the
  network boundary.
- Netlify hosts the web UI and short request/response control plane.
- A background function may run idempotent post-turn evaluation batches, but
  never serves interactive voice media.

Together model IDs are environment aliases, not hardcoded product decisions.
The selected model must pass an availability, schema-validity, latency, cost,
and safety fixture gate before the alias changes.

### Voice adapter

Netlify remains the web and control plane. The real-time voice media loop runs
in LiveKit Cloud Agents or a long-lived DigitalOcean worker:

```text
Twilio/SIP → LiveKit or WebSocket worker → speech-to-text
           → shared typed safety turn contract → Together
           → approved response → text-to-speech → caller
```

The preferred production investigation is Twilio/SIP + LiveKit Cloud Agents +
Deepgram Flux + Together + a cancellable TTS provider. A DigitalOcean
WebSocket worker is the fallback for a more inspectable masterclass build.
Netlify Functions are unsuitable for the long-lived bidirectional media loop.

## Evaluation and release gates

Engineering may build the harness and synthetic fixtures, but a clinician and
lived-experience reviewer must own final labels before unrestricted use.

The checked-in corpus must cover:

- explicit immediate danger;
- ambiguous and coded distress;
- benign stress and figurative language;
- false-positive recovery;
- multi-turn escalation;
- adversarial prompt injection;
- resource hallucination and jurisdiction mismatch;
- overclaiming, diagnosis, or treatment language;
- classifier timeout, invalid schema, and provider failure;
- output-guard rejection and safe replacement.

Prototype gate:

- all synthetic scenarios reach the expected deterministic state;
- live Together requests return schema-valid assessments or the reviewed
  abstention fallback;
- no unchecked model output is rendered;
- no raw scenario content is persisted or emitted to analytics;
- every control is keyboard reachable with a visible focus state;
- 390 px, 830 px, and 1353 px layouts pass without horizontal page overflow;
- reduced motion removes nonessential transitions;
- lint, unit, build, Playwright, and Netlify deploy-preview validation pass.

Using this lab as a real support product—as opposed to a supervised engineering
demo—additionally requires approved policy labels, privacy and incident
procedures, a current resource manifest, model qualification results, and an
explicit product-owner decision on residual risk.

## Analytics and masterclass narrative

Allowed events are `experiment_opened`, `scenario_selected`,
`harness_completed`, `voice_cta_selected`, and `experiment_exited`. Properties
are limited to scenario ID, expected/actual route, policy version, synthetic
flag, failure class, and coarse latency. Never attach user text.

The teaching sequence is: start with the failure mode, show the four-stage
loop, demonstrate all three routes, reveal the evaluation gate, then move the
same contract into the voice architecture. The CTA must not interrupt an
urgent result state.

## Decisions that remain gated

1. Name the clinical and lived-experience reviewers.
2. Approve age and jurisdiction expansion beyond adult US demonstrations.
3. Approve real-text consent, retention, tracing, and deletion policy.
4. Approve incident ownership, on-call path, and kill-switch authority.
5. Qualify the Together classifier and coach model aliases against the corpus.
6. Choose LiveKit Cloud Agents or a DigitalOcean worker for the voice phase.
7. Choose STT, TTS, and telephony providers after interruption and latency tests.

## Primary references

- [SAMHSA 988 frequently asked questions](https://www.samhsa.gov/mental-health/988/faqs)
- [SAMHSA 988 quality and services plan](https://www.samhsa.gov/sites/default/files/saving-lives-american-988-quality-service-plan.pdf)
- [NIST AI 600-1: Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
- [WHO ethics and governance of AI for health](https://www.who.int/publications/i/item/9789240029200)
- [Together structured outputs](https://docs.together.ai/docs/inference/chat/structured-outputs)
- [Together serverless models](https://docs.together.ai/docs/serverless/models)
- [Netlify Functions configuration and limits](https://docs.netlify.com/build/functions/configuration/)
- [LiveKit Agents](https://docs.livekit.io/agents/)
- [Twilio ConversationRelay](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay)
