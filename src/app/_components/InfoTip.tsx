"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small "?" trigger that reveals a short explanation next to a label
 * that isn't self-explanatory on its own. 2026-10-13 — founder's own
 * ask (see claude/next-build.md's "site clarity" round): hover opens
 * it on a device that actually has a mouse (`@media (hover: hover)`
 * in globals.css handles that half, no JS needed); on a touch device,
 * tapping the "?" toggles it open/closed, tapping anywhere else closes
 * it (the pointerdown listener below), and the small × inside the
 * bubble is there as an explicit, unambiguous close either way.
 *
 * Deliberately NOT used for "Submission pile"/"Quick-add" in the
 * curator tools panel — that one spot is the actual thing curators got
 * stuck on, per the founder's own explanation screenshot, so it got a
 * plain always-visible line instead of something hidden behind an
 * icon someone has to find.
 */
export default function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <span className="info-tip" ref={ref}>
      <button
        type="button"
        className="info-tip-trigger"
        aria-expanded={open}
        aria-label="More info"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      <span className={`info-tip-bubble${open ? " open" : ""}`} role="tooltip">
        {text}
        <button
          type="button"
          className="info-tip-close"
          aria-label="Close"
          onClick={() => setOpen(false)}
          tabIndex={open ? 0 : -1}
        >
          ×
        </button>
      </span>
    </span>
  );
}
