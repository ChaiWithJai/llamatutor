"use client";

import { useEffect, useRef, useState } from "react";
import { identityRequestHeaders } from "@/utils/clientIdentity";

export default function AccountDialog({
  open,
  email,
  onClose,
  onDataDeleted,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onDataDeleted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const downloadData = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/coach?export=1", {
        credentials: "include",
        cache: "no-store",
        headers: identityRequestHeaders(),
      });
      if (!response.ok) throw new Error("Your data could not be exported.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dharmic-data-tutor-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Your learning data was downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const deleteData = async () => {
    if (
      !window.confirm(
        "Delete all saved goals, practice reps, feedback, sessions, and streak history? Your sign-in will remain active.",
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/coach", {
        method: "DELETE",
        credentials: "include",
        headers: identityRequestHeaders(),
      });
      if (!response.ok) throw new Error("Your learning data could not be deleted.");
      onDataDeleted();
      setMessage("Your saved learning data was deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deletion failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog"
      aria-labelledby="account-dialog-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="auth-dialog-heading">
        <div>
          <p className="session-label">Learner account</p>
          <h2 id="account-dialog-title">Your saved progress</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close account dialog"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="auth-dialog-copy">
        Signed in as <strong>{email}</strong>. You control the learning data
        stored for this account.
      </p>
      <div className="account-actions">
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          onClick={() => void downloadData()}
        >
          Download my data
        </button>
        <button
          className="danger-button"
          type="button"
          disabled={busy}
          onClick={() => void deleteData()}
        >
          Delete learning data
        </button>
      </div>
      {message && (
        <p className="auth-message" role="status">
          {message}
        </p>
      )}
    </dialog>
  );
}
