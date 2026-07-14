"use client";

import { useState, useTransition } from "react";
import { grantPro, revokePro } from "./actions";

export function GrantRevokeForm({ userId, isPro }: { userId: string; isPro: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGrant() {
    setError(null);
    startTransition(async () => {
      const result = await grantPro(userId);
      if (result?.error) setError(result.error);
    });
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokePro(userId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {isPro ? (
        <button
          type="button"
          onClick={handleRevoke}
          disabled={pending}
          className="display inline-flex h-11 items-center justify-center rounded-full border border-danger/60 bg-danger/10 px-4 text-[12px] uppercase tracking-wide text-danger transition-transform focus-visible:outline-2 focus-visible:outline-danger active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Revoking…" : "Revoke"}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleGrant}
          disabled={pending}
          className="display inline-flex h-11 items-center justify-center rounded-full bg-acid px-4 text-[12px] uppercase tracking-wide text-acidink transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Granting…" : "Grant Pro"}
        </button>
      )}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
