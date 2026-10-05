"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import SignupForm from "./SignupForm";
import type { SignupContext } from "@/lib/signup";

const SEEN_KEY = "pmc-signup-popup-seen";

/**
 * The Releases-page sign-up popup (design decision, 2026-10): shows
 * itself once per visitor — tracked in localStorage, so it never
 * reappears uninvited on a later visit — and stays reachable after
 * that through the "Join the club" button this component also
 * renders. The dedicated /signup page still exists separately; this
 * is just a second, lower-friction way in for someone who landed on
 * Releases first.
 *
 * The overlay renders through a portal into `document.body` (found
 * 2026-10-06, chasing a real bug): this component is used inline on
 * `/releases`, nested inside `<main className="... gz-up">`. `gz-up`
 * (like every `.gz-*` entrance animation) ends with `animation-fill-mode:
 * both`, which keeps that element "animating" at rest — and a
 * CSS-animated `transform`, even one that settles on an identity value,
 * makes the browser treat that element as still having an active
 * transform for layout purposes. Per spec, ANY element with a transform
 * becomes the containing block for its `position: fixed` descendants —
 * so the popup's "fixed, full-viewport" overlay was actually being
 * boxed into `<main>`'s (much taller, non-viewport-sized) content area
 * instead of the real viewport, leaving the visible popup pushed down
 * into empty space below the fold. A portal sidesteps the whole
 * category of bug: wherever this component sits in the React tree, the
 * overlay's actual DOM position is always a direct child of `<body>`,
 * so it can never inherit a transformed ancestor by accident.
 */
export default function SignupPopup({
  nextDropNum,
  daysUntilNext,
  isManual,
}: Pick<SignupContext, "nextDropNum" | "daysUntilNext" | "isManual">) {
  const [open, setOpen] = useState(false);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    // One-time sync from localStorage (an external system the server
    // can't see) into React state on mount — the textbook exception to
    // "don't setState in an effect". There's no event to subscribe to
    // here, just a single read that has to happen client-side.
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOpen(true);
        localStorage.setItem(SEEN_KEY, "1");
      }
    } catch {
      // Private browsing / blocked storage — just skip the auto-show;
      // the button below still works.
    } finally {
      setCheckedStorage(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn btn-accent signup-popup-trigger"
        onClick={() => setOpen(true)}
        // Avoids a flash of an unstyled/invisible trigger before the
        // storage check above resolves on first paint.
        style={{ visibility: checkedStorage ? "visible" : "hidden" }}
      >
        Join the club
      </button>

      {open &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="modal-sheet gz-sheet" role="dialog" aria-modal="true">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 4,
                }}
              >
                <div className="wordmark" style={{ fontSize: 15 }}>
                  project music club
                </div>
                <button
                  type="button"
                  className="popup-close"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6, margin: "4px 0 20px" }}>
                One email a drop. Sign up once, that&rsquo;s it.
              </p>
              <SignupForm
                nextDropNum={nextDropNum}
                daysUntilNext={daysUntilNext}
                isManual={isManual}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
