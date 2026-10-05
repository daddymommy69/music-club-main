"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * A logged-in member's own 1-5 rating for a drop (2026-10 "next build"
 * — see claude/next-build.md). Simple click-to-rate, matching this
 * app's existing `.btn-outline` / form-control visual language rather
 * than anything fancier. Same logged-out handling as LikeButton: try
 * the request, surface a "log in to rate" prompt on a 401.
 */
export default function RateDropControl({
  dropId,
  initialRating,
}: {
  dropId: number;
  initialRating: number | null;
}) {
  const [rating, setRating] = useState(initialRating ?? 0);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function rate(n: number) {
    setBusy(true);
    setNeedsLogin(false);
    try {
      const res = await fetch("/api/account/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropId, rating: n }),
      });
      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (res.ok) setRating(n);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rate-control">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= rating ? "filled" : ""}
          disabled={busy}
          onClick={() => rate(n)}
          aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
        >
          ★
        </button>
      ))}
      {needsLogin && (
        <Link href="/account" className="mut" style={{ fontSize: 11, alignSelf: "center" }}>
          Log in to rate →
        </Link>
      )}
    </div>
  );
}
