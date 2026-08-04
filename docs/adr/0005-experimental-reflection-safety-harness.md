# ADR 0005: Isolate the experimental reflection safety harness

- Status: proposed
- Date: 2026-08-04
- Related: ADR 0002, ADR 0004, `docs/mental-health-mode-prd.md`

## Context

Dharmic Data Tutor is a sourced learning product. Its root page combines topic
selection, source retrieval, streamed Together output, practice, authentication,
and saved learner state. Mental-health language introduces a different risk and
data boundary. Reusing the lesson stream would expose model tokens before an
output check and could send sensitive content into persistence or observability
systems designed for learning.

The desired masterclass demonstration is valuable because it makes the safety
architecture visible and transferable to voice systems. That teaching goal does
not require presenting an unvalidated clinical product.

## Decision

Create an isolated `/mental-health` experiment, labelled in-product as
**Reflection mode · experiment**.

The first public slice defaults to reviewed synthetic scenarios and
deterministic responses. A separately acknowledged live lab calls Together to
demonstrate schema-constrained input assessment, bounded generation, and output
assessment. A typed policy module owns the three routes and the browser renders
an inspectable four-stage trace. The route never calls Exa, Netlify Identity,
Netlify Database, Helicone, or any voice provider.

Future model-backed work must preserve the same contract:

1. validate a schema-constrained input assessment;
2. let server application code choose the route;
3. generate only when the route permits it;
4. buffer the complete candidate response;
5. run the output check; and
6. reveal approved text or a reviewed replacement.

Provider failures and low-confidence assessments abstain into a conservative
reviewed state. Urgent states keep the interface usable and show reviewed
resources; they never automatically call, text, dispatch, terminate, or imply
that a human is monitoring the session.

Netlify hosts the web/control plane. A later voice adapter runs on LiveKit
Cloud Agents or a long-lived DigitalOcean worker because bidirectional audio is
not a short-lived Netlify Function workload.

## Alternatives considered

### Add another mode to `app/page.tsx`

Rejected. It would couple a different safety and privacy contract to the
lesson, source, account, and coaching state machines.

### Stream a coach response and judge it asynchronously

Rejected. A judge cannot retract harmful text already rendered or spoken.

### Let the model choose tools or emergency actions

Rejected. Routing and side effects are policy decisions owned by reviewed
application code.

### Present unrestricted free text as a support product

Rejected. Clinical labels, jurisdiction behavior, privacy, incident ownership,
and model qualification are unresolved. The bounded live lab is explicitly an
engineering demonstration, remains non-persistent, and always retains the
synthetic path and reviewed fallback.

## Consequences

separate route adds a small amount of duplicated shell UI, but prevents the
existing learning database and streaming path from becoming accidental
dependencies.
The experiment is honest and repeatable: guided scenarios work without provider
credentials, while the live lab demonstrates the real Together boundary. It
demonstrates the architecture rather than claiming clinical efficacy. The
separate route adds a small amount of duplicated shell UI, but prevents the
existing learning database and streaming path from becoming accidental
dependencies.
separate route adds a small amount of duplicated shell UI, but prevents the
existing learning database and streaming path from becoming accidental
dependencies.

The live lab demonstrates mechanics but cannot validate clinical classification
quality. It cannot graduate into a support product without the corpus and
reviewers defined in the PRD. Voice delivery is also a separate adapter, not a
hidden extension of the Netlify web runtime.
