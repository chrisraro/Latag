"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "./actions";

/**
 * Two-step confirm: the destructive action only becomes reachable after the
 * user types the literal string "DELETE" — a lightweight guard against a
 * stray click nuking an account.
 */
export function DeleteAccountForm() {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      // On success, deleteAccount redirects server-side and never returns here.
      const result = await deleteAccount();
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="display inline-flex h-12 items-center justify-center rounded-full border border-danger/60 bg-danger/10 px-6 text-[14px] uppercase tracking-wide text-danger transition-transform focus-visible:outline-2 focus-visible:outline-danger active:scale-[0.98]"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-danger/40 bg-danger/10 p-5">
      <p className="text-sm text-danger">
        This permanently deletes your account and license. Type <span className="font-bold">DELETE</span> to confirm.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <input
        type="text"
        value={confirmText}
        onChange={(event) => setConfirmText(event.target.value)}
        placeholder="DELETE"
        aria-label="Type DELETE to confirm"
        className="h-12 rounded-xl border border-danger/40 bg-surface2 px-4 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-danger"
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={confirmText !== "DELETE" || pending}
          className="display inline-flex h-12 items-center justify-center rounded-full bg-danger px-6 text-[14px] uppercase tracking-wide text-ink transition-transform focus-visible:outline-2 focus-visible:outline-danger active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setConfirmText("");
            setError(null);
          }}
          disabled={pending}
          className="display inline-flex h-12 items-center justify-center rounded-full border border-hairline bg-surface2 px-6 text-[14px] uppercase tracking-wide text-ink transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
