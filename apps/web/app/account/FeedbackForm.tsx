"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { submitFeedback } from "./actions";

export function FeedbackForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await submitFeedback(formData);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="rounded-2xl border border-acid/40 bg-acid/10 px-4 py-3 text-sm text-acid">
          Thanks — we got it.
        </div>
      ) : null}
      <label className="flex flex-col gap-2 text-sm text-inkdim">
        Type
        <select
          name="type"
          defaultValue="feedback"
          className="h-12 rounded-xl border border-hairline bg-surface2 px-4 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-acid"
        >
          <option value="feedback">Feedback</option>
          <option value="suggestion">Suggestion</option>
          <option value="feature_request">Feature request</option>
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm text-inkdim">
        Message
        <textarea
          name="body"
          required
          maxLength={4000}
          rows={4}
          placeholder="Tell us what's up..."
          className="rounded-xl border border-hairline bg-surface2 px-4 py-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-acid"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="display inline-flex h-12 items-center justify-center self-start rounded-full bg-acid px-6 text-[14px] uppercase tracking-wide text-acidink transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
