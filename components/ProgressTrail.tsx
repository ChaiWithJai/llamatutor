"use client";

import {
  formatPracticeDate,
  selectRecentCompletedReps,
  type CoachingGoal,
  type PracticeRep,
} from "@/utils/coaching";
import type { SyntheticEvent } from "react";

export default function ProgressTrail({
  goal,
  recentReps,
}: {
  goal: CoachingGoal;
  recentReps: PracticeRep[];
}) {
  const reps = selectRecentCompletedReps(recentReps, goal.id);
  if (reps.length === 0) return null;

  const repLabel = reps.length === 1 ? "rep" : "reps";
  const revealEntries = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) return;
    const trail = event.currentTarget;
    requestAnimationFrame(() => {
      trail.querySelector("ol")?.scrollIntoView({ block: "nearest" });
    });
  };

  return (
    <details className="progress-trail" onToggle={revealEntries}>
      <summary>
        Your last {reps.length} {repLabel} on <em>{goal.topic}</em>
      </summary>
      <ol>
        {reps.map((practiceRep) => {
          const completedAt = practiceRep.completedAt ?? practiceRep.createdAt;
          return (
            <li key={practiceRep.id}>
              <span className="progress-trail-dot" aria-hidden="true" />
              <time dateTime={completedAt}>
                {formatPracticeDate(completedAt)}
              </time>
              <span>{practiceRep.prompt}</span>
              <small>
                {practiceRep.feedback ? "feedback saved" : "completed"}
              </small>
            </li>
          );
        })}
      </ol>
      <p>
        Showing {reps.length} most recent saved {repLabel}
      </p>
    </details>
  );
}
