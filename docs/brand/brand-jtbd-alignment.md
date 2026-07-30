# Dharmic Data Tutor: brand and JTBD alignment

## Decision context

GitHub issue #1 distinguishes the current product—a topic-and-level explainer
with web grounding—from a future skill coach with practice assignment,
persistence, and a return loop. This branding release represents the current
capability honestly and leaves coaching language out until Options A/B/C are
reviewed.

## Persona-driver matrix

### Curious learner

- Business drivers: understand a topic now; control explanation depth; inspect
  where claims came from.
- Problem: “Generic AI answers are hard to calibrate and hard to verify.”
- Reality: the learner currently has to rewrite prompts and search separately.
- Solution: one topic-and-level flow keeps explanations and named sources
  together.
- Proof: the UI exposes the chosen level, streaming conversation, and source
  links in one session.
- Site value: a low-friction way to begin learning.
- Service value: a continuing conversation at the chosen level.

### Teacher, facilitator, or parent

- Business drivers: produce an age-appropriate starting explanation; retain
  source visibility; avoid representing AI output as settled fact.
- Problem: “A useful explanation still needs a clear level and evidence.”
- Reality: generic chat interfaces hide both in prompt history.
- Solution: level is a first-class control and provenance remains beside the
  response.
- Proof: every session shows its topic, selected level in URL state, and either
  named sources or an explicit unverified state.
- Site value: a transparent demonstration tool.
- Service value: a conversational draft to review with the learner.

### Open-source builder

- Business drivers: inspect implementation; reproduce deployment; understand
  limits before extending the product.
- Problem: “Demo claims often outpace the inspectable implementation.”
- Reality: the inherited site linked to a different upstream repository and
  branded itself as a finished generic tutor.
- Solution: the product links to its actual repository, publishes a health
  endpoint, design tokens, deployment runbook, and known limitations.
- Proof: source, design system, deployment files, and live health route are
  public and dated in Git.
- Site value: inspect the working path.
- Service value: fork and extend the existing explainer safely.

## Journey inventory

### Start a learning session

- Page: `/?topic=&level=`
- Entry points: direct visit, shared topic URL, example-topic button.
- User goal: receive a level-appropriate introduction to a topic.
- Business goal: complete one useful, trustworthy learning interaction.
- Primary CTA: Start learning.
- State model: topic and level are URL-addressable; messages and sources are
  session state.
- Success signal: named sources resolve and the first tutor response streams.

### Continue a session

- Page: the same URL and in-page session state.
- Entry point: follow-up composer.
- User goal: clarify or deepen the current explanation.
- Business goal: prove the tool supports dialogue rather than one-shot copy.
- Primary CTA: Send follow-up.
- Success signal: the new learner message and streamed tutor response appear
  without losing sources.

### Inspect provenance

- Page: source panel beside the session.
- Entry point: named source card.
- User goal: open the material that informed the answer.
- Business goal: reinforce Dharmic Data’s evidence-led product standard.
- Primary CTA: individual source link.
- Success signal: a source opens in a new tab; failure produces an honest
  unverified state.

## Alignment examples

### Good

- “Learn Something Useful. See Where It Comes From.” connects the learning job
  to the provenance mechanism rather than promising mastery.
- “Sources are unavailable… treat the answer as unverified” names the limit
  instead of implying the provider succeeded.
- The proof strip describes observable mechanics: topic, level, sources, and
  follow-up.

### Baseline problems corrected

- “Your Personal Tutor” was generic and implied a broader product than the
  current single-session architecture. Severity: high.
- “Powered by Llama 3.1” was stale while the runtime model had changed.
  Severity: high.
- The old GitHub CTA pointed at the upstream Nutlope repository rather than the
  deployed Dharmic Data fork. Severity: medium.
- Source failure could pass `undefined` into the prompt builder and stop the
  learning journey. Severity: high.

## Desired versus current

| Focus              | Desired state                              | Current state                                          | Remaining delta                              |
| ------------------ | ------------------------------------------ | ------------------------------------------------------ | -------------------------------------------- |
| Messaging          | Explain the current mechanism and limit    | Implemented in hero, proof strip, and failure copy     | Validate with real users                     |
| Trust              | Named sources or explicit unverified state | Implemented                                            | Add dated evaluation fixtures                |
| Accessibility      | Labeled, keyboard-usable, responsive       | Implemented and ready for automated/manual audit       | Publish audit artifact                       |
| State fidelity     | Shareable topic and level                  | Implemented in query state                             | Conversation persistence remains future work |
| Coaching direction | No implied methodology before decision     | Issue #1 remains open and the UI stays explainer-first | User must choose A/B/C before implementation |

## Opportunities

### Immediate

- Publish branded staging and production builds with real provider keys.
- Add a small fixed evaluation set covering source success, source failure,
  streaming, and follow-up.
- Record production screenshots at desktop and mobile sizes.

### Longer term

- After issue #1 is decided, add a separate practice-session state model rather
  than overloading the explainer conversation.
- Add persistence and scheduled return behavior only with an explicit privacy
  model.
- Version the token package for reuse across other Dharmic Data products.
