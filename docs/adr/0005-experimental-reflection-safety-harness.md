# ADR 0005: Lead with the voice receptionist; disclose the safety harness progressively

- Status: accepted for the experiment
- Date: 2026-08-04
- Related: ADR 0001, ADR 0002, ADR 0004, `docs/mental-health-mode-prd.md`

## Context

The first Reflection mode implementation made the four-stage safety harness the
hero and offered voice as a transfer card after completion. That accurately
showed the engineering, but buried the practical value. A masterclass audience
first needs to experience the receptionist handling a call, changing course,
and stopping when interrupted. Architecture is supporting evidence, not the
lead.

The privacy and safety boundary still differs from the sourced Tutor. Reusing
the lesson stream would reveal unchecked tokens and could send sensitive text
into learning persistence or observability.

## Decision

Keep the isolated `/mental-health` route and typed safety contract, but invert
the information hierarchy:

1. the browser voice receptionist and transcript own the primary surface;
2. guided synthetic calls work without provider or phone credentials;
3. browser speech makes speaking and cancellation tangible without collecting
   microphone or telephone data;
4. the routine path is multi-turn and asks the visitor to make one meaningful
   scheduling choice before showing an honest proposed next step;
5. ambiguous and urgent examples move behind a secondary disclosure;
6. the safety trace, infrastructure, evaluation, and limitations appear in FAQ
   and **How we built this** disclosures below the call;
7. urgent outcomes suppress commercial calls to action; and
8. an acknowledged live Together text lab remains available only as an
   inspection tool.

The safety contract remains unchanged in substance: validate structured input,
let application code route, generate only when permitted, buffer the candidate,
approve the complete output, and then reveal or speak it. Abstention and failure
select reviewed conservative content.

Netlify serves the complete demo. No phone number, Twilio/LiveKit connection,
DigitalOcean worker, microphone permission, or raw audio transport is part of
this slice. The browser demo is explicitly labelled as synthetic and cannot be
used as evidence that telephony, codecs, or transfer are production-ready.

## Alternatives considered

### Keep the architecture-first introduction

Rejected. It teaches implementation before establishing why anyone should care.

### Hide safety behavior entirely

Rejected. Progressive disclosure preserves inspectability and governance
without diluting the product surface.

### Add microphone capture immediately

Rejected for this public slice. It introduces permission, privacy, acoustic,
and failure states before they add proportional demonstration value.

### Add real telephony for the masterclass

Rejected for this slice. A phone number and continuous media add credentials,
privacy, latency, codec, and operational failure modes without improving the
core demonstration of multi-turn policy and interaction design.

## Consequences

The demo now communicates the outcome in seconds and still supports a deep
technical walkthrough. The guided call is a simulation, so copy and analytics
must remain honest about that fact. The call state machine and interruption UI
provide an acceptance seam for Issue #57, while Issue #60 supplies evidence
about the current text guards before stronger claims are made.

Broader release remains blocked on external corpus permission, independent
route review, real acoustic testing, and the privacy/incident decisions listed
in the PRD. Those gates do not block the bounded web-only masterclass demo.
