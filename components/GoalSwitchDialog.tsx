"use client";

import type { CoachingGoal, PracticeRep } from "@/utils/coaching";
import { useEffect, useRef } from "react";

export default function GoalSwitchDialog({
  open,
  currentGoal,
  pendingRep,
  nextTopic,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  currentGoal: CoachingGoal | null;
  pendingRep: PracticeRep | null;
  nextTopic: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog goal-switch-dialog"
      aria-labelledby="goal-switch-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
    >
      <p className="session-label">Switching goals</p>
      <h2 id="goal-switch-title">Start “{nextTopic}” instead?</h2>
      <p className="goal-switch-rep">
        <strong>{currentGoal?.topic}</strong> has a rep waiting — “
        {pendingRep?.prompt}”
      </p>
      <p className="auth-dialog-copy">
        Starting a new topic <strong>archives your current goal</strong>, not
        deletes it. Your streak and saved reps stay put, but this unfinished rep
        will not count unless you complete it first.
      </p>
      <div className="goal-switch-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          Finish this rep first
        </button>
        <button className="primary-button" type="button" onClick={onConfirm}>
          Start “{nextTopic}”
        </button>
      </div>
    </dialog>
  );
}
