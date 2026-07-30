"use client";

import type { CoachingGoal, PracticeRep } from "@/utils/coaching";
import StreakBadge from "@/components/StreakBadge";
import { FormEvent, useEffect, useRef, useState } from "react";

export default function GoalSwitchDialog({
  open,
  currentGoal,
  pendingRep,
  nextTopic,
  streakCount,
  busy,
  onCancel,
  onConfirm,
  onFinishRep,
}: {
  open: boolean;
  currentGoal: CoachingGoal | null;
  pendingRep: PracticeRep | null;
  nextTopic: string;
  streakCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onFinishRep: (attempt: string) => Promise<boolean>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [attempt, setAttempt] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
  }, [open]);

  if (!open) return null;

  const handleCancel = () => {
    setAttempt("");
    onCancel();
  };

  const handleConfirm = () => {
    setAttempt("");
    onConfirm();
  };

  const submitFinish = async (event: FormEvent) => {
    event.preventDefault();
    const value = attempt.trim();
    if (!value) return;
    const saved = await onFinishRep(value);
    if (saved) setAttempt("");
  };

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog goal-switch-dialog"
      aria-labelledby="goal-switch-title"
      onCancel={(event) => {
        event.preventDefault();
        handleCancel();
      }}
      onClose={handleCancel}
    >
      <div className="goal-switch-heading">
        <div>
          <p className="session-label">Switching goals</p>
          <h2 id="goal-switch-title">Two minutes and it counts</h2>
        </div>
        {streakCount > 0 && <StreakBadge count={streakCount} />}
      </div>
      <p className="auth-dialog-copy">
        Your open rep on <strong>{currentGoal?.topic}</strong> is short.
        Finish it right here and your streak lands before “{nextTopic}”
        begins.
      </p>

      <form className="goal-switch-finish" onSubmit={submitFinish}>
        <p className="goal-switch-rep">{pendingRep?.prompt}</p>
        <label htmlFor="goal-switch-attempt">Try it now</label>
        <textarea
          id="goal-switch-attempt"
          value={attempt}
          maxLength={8000}
          onChange={(event) => setAttempt(event.target.value)}
          placeholder="Write your own explanation or example. The tutor will respond with focused feedback."
          rows={3}
          disabled={busy}
          required
        />
        <button
          className="primary-button goal-switch-finish-button"
          type="submit"
          disabled={busy || !attempt.trim()}
        >
          {busy ? "Saving…" : "Save this rep, then switch"}
        </button>
      </form>

      <div className="goal-switch-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={handleCancel}
          disabled={busy}
        >
          Keep {currentGoal?.topic} open
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={handleConfirm}
          disabled={busy}
        >
          Archive and switch anyway
        </button>
      </div>
      <p className="goal-switch-footnote">
        Archiving keeps everything — streak, feedback, every completed rep. It
        only closes the goal.
      </p>
    </dialog>
  );
}
