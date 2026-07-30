"use client";

import type { CoachingGoal, PracticeRep } from "@/utils/coaching";
import NextRepCard from "@/components/NextRepCard";
import ProgressTrail from "@/components/ProgressTrail";
import ScrollCue from "@/components/ScrollCue";
import StreakBadge from "@/components/StreakBadge";
import { FormEvent, useState } from "react";

export default function CoachPanel({
  signedIn,
  goal,
  rep,
  streakCount,
  recentReps,
  busy,
  completion,
  onSignIn,
  onSubmit,
}: {
  signedIn: boolean;
  goal: CoachingGoal | null;
  rep: PracticeRep | null;
  streakCount: number;
  recentReps: PracticeRep[];
  busy: boolean;
  completion: { feedback: string; nextRep: string } | null;
  onSignIn: () => void;
  onSubmit: (attempt: string) => Promise<boolean>;
}) {
  const [attempt, setAttempt] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = attempt.trim();
    if (!value) return;
    const saved = await onSubmit(value);
    if (saved) setAttempt("");
  };

  if (!signedIn) {
    return (
      <section className="coach-panel coach-panel-invite">
        <span
          className="coach-loop-mark"
          role="img"
          aria-label="Learn, practice, get feedback, and continue"
        >
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path className="coach-loop-path" d="M18 45A22 22 0 1 1 48 17" />
            <path className="coach-loop-arrow" d="m43 12 7 3-3 7" />
            <circle
              className="coach-loop-node coach-loop-node-1"
              cx="17"
              cy="44"
              r="5"
            />
            <circle
              className="coach-loop-node coach-loop-node-2"
              cx="16"
              cy="23"
              r="5"
            />
            <circle
              className="coach-loop-node coach-loop-node-3"
              cx="34"
              cy="12"
              r="5"
            />
            <circle
              className="coach-loop-node coach-loop-node-4"
              cx="49"
              cy="28"
              r="5"
            />
          </svg>
        </span>
        <strong>Keep a goal and return to your next rep.</strong>
        <button className="secondary-button" type="button" onClick={onSignIn}>
          Sign in to continue
        </button>
      </section>
    );
  }

  if (busy && !rep) {
    return (
      <section className="coach-panel" aria-busy="true">
        <p className="session-label">Preparing your practice rep…</p>
      </section>
    );
  }

  if (completion) {
    return (
      <section className="coach-panel coach-panel-complete" aria-live="polite">
        <div className="coach-completion-main">
          <div className="coach-panel-heading">
            <div>
              <p className="session-label">Rep complete</p>
            </div>
            <StreakBadge count={streakCount} />
          </div>
          <NextRepCard text={completion.nextRep} />
          <small>
            A streak records that you practiced. It does not claim mastery.
          </small>
        </div>
        {goal && <ProgressTrail goal={goal} recentReps={recentReps} />}
        <ScrollCue />
      </section>
    );
  }

  if (!goal || !rep) {
    return (
      <section className="coach-panel">
        <p className="session-label">Coaching progress</p>
        <p>We could not prepare a saved rep. Retry the session in a moment.</p>
      </section>
    );
  }

  return (
    <section className="coach-panel" aria-labelledby="practice-rep-title">
      <div className="coach-panel-heading">
        <div>
          <p className="session-label">Your practice rep</p>
          <h2 id="practice-rep-title">{rep.prompt}</h2>
        </div>
        {streakCount > 0 && <StreakBadge count={streakCount} />}
      </div>
      <form onSubmit={submit}>
        <label htmlFor="practice-attempt">Try it now</label>
        <textarea
          id="practice-attempt"
          value={attempt}
          maxLength={8000}
          onChange={(event) => setAttempt(event.target.value)}
          placeholder="Write your own explanation or example. The tutor will respond with focused feedback."
          rows={3}
          disabled={busy}
          required
        />
        <button
          className="primary-button"
          type="submit"
          disabled={busy || !attempt.trim()}
        >
          {busy ? "Coaching…" : "Get feedback and save my next rep"}
        </button>
      </form>
      <ScrollCue />
    </section>
  );
}
