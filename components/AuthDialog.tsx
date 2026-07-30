"use client";

import {
  login,
  requestPasswordRecovery,
  signup,
  updateUser,
  type User,
} from "@netlify/identity";
import { FormEvent, useEffect, useRef, useState } from "react";

type AuthMode = "login" | "signup" | "recovery" | "reset";

export default function AuthDialog({
  open,
  initialMode = "login",
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
  onAuthenticated: (user: User) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (mode === "recovery") {
        await requestPasswordRecovery(email);
        setMessage("Check your email for a password-reset link.");
        return;
      }

      if (mode === "reset") {
        const user = await updateUser({ password });
        onAuthenticated(user);
        onClose();
        return;
      }

      if (mode === "signup") {
        const user = await signup(email, password);
        if (user.confirmedAt) {
          onAuthenticated(user);
          onClose();
        } else {
          setMessage("Check your email to confirm your account, then sign in.");
          setMode("login");
        }
        return;
      }

      const user = await login(email, password);
      onAuthenticated(user);
      onClose();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signup"
      ? "Create your learner account"
      : mode === "recovery"
        ? "Reset your password"
        : mode === "reset"
          ? "Choose a new password"
          : "Welcome back";

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog"
      aria-labelledby="auth-dialog-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="auth-dialog-heading">
        <div>
          <p className="session-label">Dharmic Data Tutor</p>
          <h2 id="auth-dialog-title">{title}</h2>
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
        Sign in to save goals, practice reps, feedback, and your next step
        across devices.
      </p>

      <form className="auth-form" onSubmit={submit}>
        {mode !== "reset" && (
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
        )}
        {mode !== "recovery" && (
          <label>
            Password
            <input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        )}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy
            ? "Working…"
            : mode === "signup"
              ? "Create account"
              : mode === "recovery"
                ? "Send reset link"
                : mode === "reset"
                  ? "Save new password"
                  : "Sign in"}
        </button>
      </form>

      {message && (
        <p className="auth-message" role="status">
          {message}
        </p>
      )}

      <div className="auth-switches">
        {mode !== "signup" && mode !== "reset" && (
          <button type="button" onClick={() => setMode("signup")}>
            Create an account
          </button>
        )}
        {mode !== "login" && (
          <button type="button" onClick={() => setMode("login")}>
            Sign in instead
          </button>
        )}
        {mode === "login" && (
          <button type="button" onClick={() => setMode("recovery")}>
            Forgot password?
          </button>
        )}
      </div>
    </dialog>
  );
}
