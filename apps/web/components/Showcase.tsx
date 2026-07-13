"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

const SCREENS = [
  { src: "/screens/console.png",            title: "Rapid Console",       caption: "Log a piece in 5 seconds — wheels, chips, zero typing." },
  { src: "/screens/dashboard-bulto.png",    title: "Bulto Dashboard",     caption: "Capital recovery to break-even, live from your phone." },
  { src: "/screens/dashboard-selector.png", title: "Selector Dashboard",  caption: "Projected and realized profit, piece by piece." },
  { src: "/screens/sessions.png",           title: "Sessions",            caption: "Every sourcing run, headline number first." },
  { src: "/screens/item-detail.png",        title: "Item Detail",         caption: "Photos, sizes, prices — mark sold in one swipe." },
  { src: "/screens/ig-export.png",          title: "IG Drop Export",      caption: "The whole drop caption, ready to paste." },
] as const;

const COUNT = SCREENS.length;

// Wrap-aware signed offset in [-2..3], normalized to the natural short side.
function signedOffset(idx: number, active: number) {
  let d = (idx - active + COUNT) % COUNT;
  if (d > COUNT / 2) d -= COUNT;
  return d;
}

function cardStyle(d: number): React.CSSProperties {
  if (Math.abs(d) > 2) {
    return {
      transform: `translateX(${d > 0 ? 130 : -130}%) scale(0.5)`,
      opacity: 0,
      zIndex: 0,
      pointerEvents: "none",
    };
  }
  if (Math.abs(d) === 2) {
    return {
      transform: `translateX(${d > 0 ? 100 : -100}%) rotateY(${d > 0 ? -34 : 34}deg) scale(0.66)`,
      opacity: 0.28,
      zIndex: 10,
    };
  }
  if (Math.abs(d) === 1) {
    return {
      transform: `translateX(${d > 0 ? 58 : -58}%) rotateY(${d > 0 ? -26 : 26}deg) scale(0.82)`,
      opacity: 0.6,
      zIndex: 20,
    };
  }
  return {
    transform: "translateX(0) rotateY(0deg) scale(1)",
    opacity: 1,
    zIndex: 30,
  };
}

export function Showcase() {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean; consumed: boolean } | null>(null);

  const goPrev = () => setActive((a) => (a - 1 + COUNT) % COUNT);
  const goNext = () => setActive((a) => (a + 1) % COUNT);

  const openLightbox = () => setOpen(true);

  useEffect(() => {
    const dialogEl = dialogRef.current;
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  }, [open]);

  // Sync React state when the dialog closes via native means (Esc, etc).
  useEffect(() => {
    const dialogEl = dialogRef.current;
    if (!dialogEl) return;
    const onClose = () => setOpen(false);
    dialogEl.addEventListener("close", onClose);
    return () => dialogEl.removeEventListener("close", onClose);
  }, []);

  const onStageKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  };

  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, dragging: true, consumed: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.dragging) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 40) {
      drag.consumed = true;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.dragging) return;
    const dx = e.clientX - drag.startX;
    drag.dragging = false;
    if (Math.abs(dx) > 40) {
      drag.consumed = true;
      if (dx > 0) goPrev();
      else goNext();
    }
  };

  const onCardClick = (idx: number) => {
    if (dragRef.current?.consumed) {
      dragRef.current.consumed = false;
      return;
    }
    if (idx === active) {
      openLightbox();
    } else {
      setActive(idx);
    }
  };

  const onDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      setOpen(false);
    }
  };

  const activeScreen = SCREENS[active];

  const offsets = useMemo(() => SCREENS.map((_, idx) => signedOffset(idx, active)), [active]);

  return (
    <div className="overflow-hidden">
      <div
        ref={stageRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="App screens"
        tabIndex={0}
        onKeyDown={onStageKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative mx-auto flex items-center justify-center focus-visible:outline-2 focus-visible:outline-acid"
        style={{
          perspective: "1200px",
          height: "clamp(420px, 60vw, 560px)",
          touchAction: "pan-y",
        }}
      >
        {SCREENS.map((screen, idx) => {
          const d = offsets[idx];
          const isActive = d === 0;
          const style = cardStyle(d);
          return (
            <button
              key={screen.src}
              type="button"
              aria-label={`${screen.title} — open larger preview`}
              onClick={() => onCardClick(idx)}
              className={`motion-reduce:transition-none absolute rounded-[28px] overflow-hidden focus-visible:outline-2 focus-visible:outline-acid ${
                isActive ? "ring-1 ring-acid/40" : ""
              }`}
              style={{
                ...style,
                width: "clamp(200px, 56vw, 300px)",
                transition: "transform 480ms cubic-bezier(0.22,1,0.36,1), opacity 480ms",
                boxShadow: isActive ? "0 0 60px -20px rgba(184,241,53,0.35)" : undefined,
              }}
            >
              <Image
                src={screen.src}
                alt={`${screen.title} screen`}
                width={780}
                height={1688}
                sizes="(max-width: 640px) 60vw, 300px"
                priority={idx === 0}
                className="h-auto w-full"
              />
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Previous screen"
          onClick={goPrev}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface2 text-ink transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-acid"
        >
          <span aria-hidden>‹</span>
        </button>
        <div className="flex items-center gap-2">
          {SCREENS.map((screen, idx) => (
            <button
              key={screen.src}
              type="button"
              aria-label={`Go to ${screen.title}`}
              onClick={() => setActive(idx)}
              className={`h-2 rounded-full transition-[width,background-color] focus-visible:outline-2 focus-visible:outline-acid ${
                idx === active ? "w-6 bg-acid" : "w-2 bg-hairline"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Next screen"
          onClick={goNext}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface2 text-ink transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-acid"
        >
          <span aria-hidden>›</span>
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="showcase-lightbox-title"
        onClick={onDialogClick}
        onKeyDown={onDialogKeyDown}
        className="border-0 bg-transparent p-0"
      >
        <div className="relative rounded-2xl border border-hairline bg-surface1 p-4">
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface2 text-ink focus-visible:outline-2 focus-visible:outline-acid"
          >
            <span aria-hidden>✕</span>
          </button>
          <Image
            src={activeScreen.src}
            alt={`${activeScreen.title} screen`}
            width={780}
            height={1688}
            className="mx-auto h-[85dvh] max-h-[85dvh] w-auto rounded-[20px]"
          />
          <h3 id="showcase-lightbox-title" className="display mt-4 text-lg text-ink">
            {activeScreen.title}
          </h3>
          <p className="mt-1 max-w-[60ch] text-inkdim">{activeScreen.caption}</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              aria-label="Previous screen"
              onClick={goPrev}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface2 text-ink focus-visible:outline-2 focus-visible:outline-acid"
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              aria-label="Next screen"
              onClick={goNext}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface2 text-ink focus-visible:outline-2 focus-visible:outline-acid"
            >
              <span aria-hidden>›</span>
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
