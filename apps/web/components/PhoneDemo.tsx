export function PhoneDemo() {
  const rows = [
    { b: "Nike", meta: "Tee · 9/10 · PTP 21.5\" · L 27\"", p: "₱350" },
    { b: "Carhartt", meta: "Hoodie · 9/10 · PTP 24\" · L 28\"", p: "₱750" },
    { b: "Polo RL", meta: "Polo · 9/10 · PTP 22\" · L 28\"", p: "₱480" },
  ];
  return (
    <div aria-hidden className="mx-auto w-[300px] rounded-[42px] border-8 border-surface2 bg-bg p-4 shadow-[0_0_80px_-20px_rgba(184,241,53,0.25)]">
      <div className="flex items-center justify-between pt-2">
        <span className="display text-[15px] text-ink">Naga Run #4</span>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-[9px] tracking-wider text-inkdim">BULTO</span>
      </div>
      <p className="mt-4 text-[10px] uppercase tracking-widest text-inkfaint">Capital recovered</p>
      <p className="display-black tnum text-4xl text-acid">38%</p>
      <div className="mt-2 h-2.5 rounded-full border border-hairline bg-surface2">
        <div className="h-full w-[38%] rounded-full bg-acid" />
      </div>
      <p className="tnum mt-1.5 text-[10px] text-inkfaint">₱3,800 of ₱10,000 bale</p>
      <ul className="mt-4 divide-y divide-hairline">
        {rows.map((r) => (
          <li key={r.b} className="flex items-center gap-2.5 py-2.5">
            <span className="display flex h-9 w-9 items-center justify-center rounded-lg bg-surface2 text-[13px] text-inkfaint">{r.b[0]}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-ink">{r.b}</span>
              <span className="tnum block truncate text-[9px] text-inkfaint">{r.meta}</span>
            </span>
            <span className="tnum text-[12px] font-bold text-ink">{r.p}</span>
          </li>
        ))}
      </ul>
      <div className="display mt-3 rounded-full bg-acid py-2.5 text-center text-[11px] uppercase tracking-wide text-acidink">＋ Add Item</div>
    </div>
  );
}
