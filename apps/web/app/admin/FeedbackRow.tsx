"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { setFeedbackStatus } from "./actions";

type FeedbackStatus = "new" | "reviewed" | "done";

const NEXT_STATUS: Record<FeedbackStatus, FeedbackStatus> = {
  new: "reviewed",
  reviewed: "done",
  done: "new",
};

export function FeedbackRow({
  id,
  type,
  status,
  body,
  createdAt,
}: {
  id: string;
  type: string;
  status: FeedbackStatus;
  body: string;
  createdAt: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const truncated = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  const next = NEXT_STATUS[status];

  function handleCycle() {
    setError(null);
    startTransition(async () => {
      const result = await setFeedbackStatus(id, next);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{type.replace("_", " ")}</Badge>
          <Badge>{status}</Badge>
          <span className="tnum text-xs text-inkfaint">
            {new Date(createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCycle}
          disabled={pending}
          className="display inline-flex h-11 items-center justify-center rounded-full border border-hairline bg-surface1 px-4 text-[12px] uppercase tracking-wide text-ink transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Updating…" : `Mark ${next}`}
        </button>
      </div>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
      {body.length > 140 ? (
        <details className="text-sm text-inkdim">
          <summary className="cursor-pointer text-ink">{truncated}</summary>
          <p className="mt-2 whitespace-pre-wrap">{body}</p>
        </details>
      ) : (
        <p className="text-sm text-inkdim">{body}</p>
      )}
    </li>
  );
}
