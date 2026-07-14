"use client";

import { useState, useTransition } from "react";
import { updatePrice } from "./actions";

export function PriceRow({ sku, price, currency }: { sku: string; price: number; currency: string }) {
  const [value, setValue] = useState(String(price));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSuccess(false);
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError("Enter a whole number ≥ 1.");
      return;
    }
    startTransition(async () => {
      const result = await updatePrice(sku, parsed);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-hairline bg-surface2 p-4">
      <div>
        <p className="display text-sm uppercase tracking-wide text-ink">{sku}</p>
        <p className="text-xs text-inkfaint">{currency}</p>
      </div>
      <div className="flex items-center gap-3">
        {error ? (
          <span role="alert" className="text-xs text-danger">
            {error}
          </span>
        ) : null}
        {success ? (
          <span role="status" className="text-xs text-acid">
            Saved
          </span>
        ) : null}
        <label className="sr-only" htmlFor={`price-${sku}`}>
          Price for {sku}
        </label>
        <input
          id={`price-${sku}`}
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSuccess(false);
          }}
          className="tnum h-11 w-28 rounded-xl border border-hairline bg-surface1 px-3 text-right text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-acid"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="display inline-flex h-11 items-center justify-center rounded-full bg-acid px-5 text-[12px] uppercase tracking-wide text-acidink transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
