"use client";

import { useState } from "react";
import Link from "next/link";
import { NavArrowIcon } from "./icons/ArrowIcons";

/**
 * A song's own 1-5 rating (2026-10-07 "Browse" round — see
 * claude/next-build.md): stacked with LikeButton next to a track row's
 * title/artist, "matching" its size — same compact bordered-chip
 * treatment as .like-btn, just with 5 small stars instead of a heart.
 *
 * 2026-10-15 — dropped the public average/count number that used to
 * sit right after the stars ("4.5") — founder's own ask, as part of
 * the same drop-page declutter as the whole-drop rating line. Just the
 * star row now; a song's own average/count still lives in the DB
 * (songRatings.ts) for whenever it's needed again, this just stopped
 * rendering it here.
 */
export default function SongRatingControl({
  songId,
  initialRating,
}: {
  songId: number;
  initialRating: number | null;
}) {
  const [rating, setRating] = useState(initialRating ?? 0);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rate(n: number) {
    setBusy(true);
    setNeedsLogin(false);
    setError(null);
    try {
      const res = await fetch("/api/account/song-rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, rating: n }),
      });
      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save your rating.");
        return;
      }
      setRating(n);
    } catch {
      setError("Couldn't save your rating.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="song-rate-control">
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
        <Link href="/account" className="mut" style={{ fontSize: 10 }}>
          Log in <NavArrowIcon size={10} />
        </Link>
      )}
      {error && <span className="mut" style={{ fontSize: 10 }}>{error}</span>}
    </span>
  );
}
