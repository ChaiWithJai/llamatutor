# ADR 0002: Option B on Netlify Identity and Netlify Database

- Status: Accepted
- Date: 2026-07-30
- Decision issue: [#9](https://github.com/ChaiWithJai/llamatutor/issues/9)

## Context

LlamaTutor currently explains a topic once and forgets the learner. The product
direction requires a durable coaching loop: set a goal, do a short practice
rep, get precise feedback, and return to a clear next rep.

The application and domain already run on Netlify. Adding a separate
application host or identity vendor would increase the number of systems we
must secure, observe, and recover without improving the first coaching loop.

## Decision

Build Option B: keep the sourced explainer, then wrap it in a simple practice
and return loop.

- Netlify Identity owns email/password accounts and server-side authentication.
- Netlify Database owns learner profiles, goals, practice reps, coaching
  sessions, and streak state.
- Every database query is scoped by the authenticated Identity user on the
  server. Clients never supply a user ID.
- One learner has at most one active goal and one pending rep for that goal.
- Streaks record completed practice days, not claimed mastery.
- Source failures remain visible and do not block an unverified lesson.
- Learners can download or delete all stored coaching data.
- Deploy previews use isolated database branches; production uses the
  production database.

## Consequences

This is the shortest path to a useful return loop and keeps operations in the
hosting system already in use. It creates a platform dependency on Netlify,
but the data is ordinary Postgres and the application can still be container
deployed if a later migration is justified.

The first release deliberately excludes reminders, social features, grading,
and complex curricula. We should add those only after real return behavior
shows that the basic loop is valuable.

## Munger-style guardrails

- Invert: never lose a learner's attempt or pretend a failed provider call
  succeeded.
- Avoid incentives that lie: streaks count practice, never competence.
- Stay inside the circle of competence: use managed identity and Postgres
  rather than inventing either.
- Prefer reversible choices: keep the schema portable and the Droplet fallback
  deployable.
- Demand evidence: ship a small loop, measure returns, then expand.
