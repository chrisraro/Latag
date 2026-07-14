"use client";

import { useState, useTransition } from "react";
import { setFlag } from "./actions";

export function FlagRow({
  flagKey,
  enabled,
  notes,
}: {
  flagKey: string;
  enabled: boolean;
  notes: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result = await setFlag(flagKey, !enabled);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-hairline bg-surface2 p-4">
      <div>
        <p className="display text-sm text-ink">{flagKey}</p>
        {notes ? <p className="mt-1 text-xs text-inkfaint">{notes}</p> : null}
        {error ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-pressed={enabled}
        className={`display inline-flex h-11 items-center justify-center rounded-full px-5 text-[12px] uppercase tracking-wide transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] disabled:opacity-60 ${
          enabled ? "bg-acid text-acidink" : "border border-hairline bg-surface1 text-inkdim"
        }`}
      >
        {pending ? "…" : enabled ? "ON" : "OFF"}
      </button>
    </div>
  );
}
