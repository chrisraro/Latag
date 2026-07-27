/**
 * Hero device mock — the app's actual home screen since the pivot: Inventory,
 * with the floating glass tab bar underneath it. Rows carry each department's
 * own measurements so the mock makes the same claim the page does.
 *
 * Decorative: aria-hidden, because every fact rendered here is stated in real
 * text beside it.
 */
export function PhoneDemo() {
  const rows = [
    { b: "Levi's", meta: "Jeans · 8/10 · W 32\" · INS 30\"", p: "₱650" },
    { b: "Nike", meta: "Sneakers · 9/10 · US 9 · 27cm", p: "₱1,200" },
    { b: "Carhartt", meta: "Hoodie · 9/10 · PTP 24\" · L 28\"", p: "₱750" },
    { b: "Coach", meta: "Tote · 8/10 · W 14\" · H 11\"", p: "₱1,450" },
  ];
  const chips = ["All", "Tops", "Bottoms", "Footwear"];
  const tabs = ["Inventory", "Batches", "Shop", "Settings"];

  return (
    <div
      aria-hidden
      className="relative mx-auto w-[300px] rounded-[42px] border-8 border-surface2 bg-bg p-4 pb-20 shadow-[0_0_80px_-20px_rgba(184,241,53,0.25)]"
    >
      <div className="flex items-center justify-between pt-2">
        <span className="display text-[17px] text-ink">Inventory</span>
        <span className="tnum rounded-full border border-hairline px-2 py-0.5 text-[10px] text-inkdim">142</span>
      </div>
      <p className="tnum mt-1.5 text-[9.5px] text-inkfaint">142 items · 96 available · ₱84,300 stock value</p>

      <div className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-hairline bg-surface2 px-3">
        <span className="text-[11px] text-inkfaint">Search brand, name, category</span>
      </div>

      <div className="mt-2.5 flex gap-1.5">
        {chips.map((c, i) => (
          <span
            key={c}
            className={`rounded-full px-2.5 py-1 text-[9.5px] ${
              i === 0 ? "bg-acid font-semibold text-acidink" : "border border-hairline text-inkdim"
            }`}
          >
            {c}
          </span>
        ))}
      </div>

      <ul className="mt-3 divide-y divide-hairline">
        {rows.map((r) => (
          <li key={r.b} className="flex items-center gap-2.5 py-2.5">
            <span className="display flex h-9 w-9 items-center justify-center rounded-lg bg-surface2 text-[13px] text-inkfaint">
              {r.b[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-ink">{r.b}</span>
              <span className="tnum block truncate text-[9px] text-inkfaint">{r.meta}</span>
            </span>
            <span className="tnum text-[12px] font-bold text-ink">{r.p}</span>
          </li>
        ))}
      </ul>

      {/* Floating glass tab bar — the app's real navigation. */}
      <div className="absolute inset-x-5 bottom-5 flex items-center justify-between rounded-full border border-hairline bg-surface2/80 px-3 py-2 backdrop-blur">
        {tabs.map((t, i) => (
          <span
            key={t}
            className={`rounded-full px-2 py-1 text-[8.5px] uppercase tracking-wide ${
              i === 0 ? "bg-acid font-bold text-acidink" : "text-inkfaint"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
