# Dharmic Data Tutor design system

Version: 1.0.0

This product inherits the live Dharmic Data identity while giving learning
states their own clear semantics. The system is intentionally bright, direct,
and inspectable: useful action first, named evidence beside the claim, honest
limits when evidence is unavailable.

## Foundations

The implementation lives in `styles/tokens.css`. Tokens have three tiers:

1. Global values use the `--dd-*` prefix.
2. Semantic aliases describe intent, such as `--color-canvas` and
   `--color-accent-proof`.
3. Component tokens describe a reusable surface, such as
   `--button-bg-primary` and `--field-border`.

Components must reference semantic or component tokens. Raw color values belong
only in the global palette.

### Color roles

| Role      | Token                     | Use                                        |
| --------- | ------------------------- | ------------------------------------------ |
| Canvas    | `--color-canvas`          | Warm page background                       |
| Ink       | `--color-text`            | Text, borders, primary actions             |
| Learning  | `--color-accent-learning` | Topics, positive progress, tutor mark      |
| Proof     | `--color-accent-proof`    | Sources and provenance                     |
| Level     | `--color-accent-level`    | User-controlled depth and learner messages |
| Follow-up | `--color-accent-followup` | Continued exploration                      |
| Warning   | `--color-warning`         | Transparent limits and attention           |
| Danger    | `--color-danger`          | Recoverable service errors                 |

Color is never the only state cue. Every colored status has a label or
supporting copy.

### Typography

- Display: Fredoka, weight 650. Use for product headlines and compact card
  titles.
- Body: Inter, weights 400–800. Use for controls, explanations, and source
  metadata.
- Hero titles use tight tracking and a fluid scale. Reading text stays at or
  above 16px on desktop and uses a 1.5–1.65 line height.

### Shape, space, and elevation

- Spacing follows a 4px base scale.
- Cards use 12–32px radii; pills are reserved for compact actions and labels.
- Primary interaction cards use a black offset shadow. Secondary surfaces use
  a soft ambient shadow or no shadow.
- Borders are part of the identity and remain visible at 1–2px.

### Motion

Interaction motion uses the fast (160ms) or base (240ms) duration token. The
system honors `prefers-reduced-motion` and removes nonessential animation.

## Product components

### Product lockup

The official Dharmic Data logo appears beside a simple “Tutor” product name.
The parent logo links to `dharmicdata.org`; the product name links home.

### Topic composer

One labeled textarea, one explicit level selector, and one primary submit
action. Enter submits; Shift+Enter adds a line. Suggestions are real buttons
and only populate the field—they do not trigger paid inference.

### Proof strip

Four cards explain the existing journey: topic, level, sources, follow-up.
These are mechanism claims, not outcome claims.

### Learning session

The conversation and named sources remain visible together. Learner messages
use the level color; tutor responses use the learning mark. Source failure has
an explicit unverified state and never pretends grounding succeeded.

### Coaching panel

Signed-in learners see one concrete practice rep beside the lesson. Completing
it produces warm, direct feedback and a single next rep. The panel describes a
streak as practice history and never presents it as a grade or mastery score.

### Account and resume states

The header exposes sign-in or a compact account control. Returning learners
see their active topic and next rep before starting a new lesson. The account
dialog supports data download and deletion in plain language; deletion
requires an explicit browser confirmation.

### Error states

Errors are recoverable, human-readable, and shown in the current context.
Provider details and secrets stay server-side.

## Accessibility contract

- A skip link targets the learning tool.
- Every field has a persistent label.
- Keyboard focus uses a 3px blue outline.
- Touch targets are at least 44px.
- Streaming content uses `aria-live="polite"`.
- Loading regions expose `aria-busy`.
- Reduced-motion preferences are honored.
- Source titles and hostnames remain readable without relying on favicons.
- Account dialogs use native modal focus management and have named close
  controls.
