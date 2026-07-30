# JTBD visual governance trail

Issue #30 governs this visual pass. The capture harness replays the same
deterministic public, failure, authentication, and coaching states used by the
acceptance suite:

```bash
node scripts/capture-jtbd-governance.mjs before https://tutor.dharmicdata.org
node scripts/capture-jtbd-governance.mjs after http://127.0.0.1:3211
```

All desktop flow screenshots use a 1353×768 viewport except the first four
entry states, which deliberately use the reported 1353×534 laptop viewport.
Mobile uses 390×844. Reduced motion is enabled for stable evidence.

| JTBD state            | Before                                     | After                                    |
| --------------------- | ------------------------------------------ | ---------------------------------------- |
| First laptop viewport | [before](before/01-entry-laptop.png)       | [after](after/01-entry-laptop.png)       |
| Topic ready           | [before](before/02-topic-ready.png)        | [after](after/02-topic-ready.png)        |
| Preparing explanation | [before](before/03-preparing.png)          | [after](after/03-preparing.png)          |
| Sourced session       | [before](before/04-sourced-session.png)    | [after](after/04-sourced-session.png)    |
| Sign in               | [before](before/05-sign-in.png)            | [after](after/05-sign-in.png)            |
| Source failure        | [before](before/06-unverified-session.png) | [after](after/06-unverified-session.png) |
| Resume coaching       | [before](before/07-resume.png)             | [after](after/07-resume.png)             |
| Practice rep          | [before](before/08-practice.png)           | [after](after/08-practice.png)           |
| Feedback and next rep | [before](before/09-feedback-next-rep.png)  | [after](after/09-feedback-next-rep.png)  |
| Goal switch           | [before](before/10-goal-switch.png)        | [after](after/10-goal-switch.png)        |
| Mobile entry          | [before](before/11-entry-mobile.png)       | [after](after/11-entry-mobile.png)       |
| Mobile session        | [before](before/12-session-mobile.png)     | [after](after/12-session-mobile.png)     |

The screenshots are evidence, not golden pixel tests. Automated checks enforce
the behavior that matters: first-viewport fit, overflow, breakpoint reflow,
keyboard operation, source-failure honesty, reduced motion, and the complete
Option B coaching loop.
