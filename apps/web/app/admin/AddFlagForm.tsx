"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { addFlag } from "./actions";

export function AddFlagForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const key = String(formData.get("key") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!/^[a-z0-9_-]{1,64}$/.test(key)) {
      setError("Key must be 1-64 lowercase letters, numbers, - or _.");
      return;
    }

    startTransition(async () => {
      const result = await addFlag(key, notes);
      if (result?.error) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3" noValidate>
      {error ? (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-xs text-inkdim">
        Key
        <input
          type="text"
          name="key"
          required
          pattern="[a-z0-9_-]+"
          placeholder="new-scan-flow"
          className="h-11 w-48 rounded-xl border border-hairline bg-surface2 px-3 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-acid"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-inkdim">
        Notes
        <input
          type="text"
          name="notes"
          placeholder="optional"
          className="h-11 w-64 rounded-xl border border-hairline bg-surface2 px-3 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-acid"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="display inline-flex h-11 items-center justify-center rounded-full bg-acid px-5 text-[12px] uppercase tracking-wide text-acidink transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
