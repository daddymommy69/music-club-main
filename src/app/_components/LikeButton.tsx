"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * A song's public like toggle (2026-10 "next build" — see
 * claude/next-build.md). Any member can like any song on any drop,
 * past or current — the count is public, shown here, not a
 * private-only favorites list. Works for a logged-out viewer by
 * attempting the request and surfacing a "log in to like" prompt on a
 * 401, rather than hiding the button outright — a visitor shouldn't
 * need to already know they're logged out before they can see what
 * this control is.
 */
export default function LikeButton({
  songId,
  initialLiked,
  initialCount,
}: {
  songId: number;
  initialLiked: boolean;
  initialCount: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function toggle() {
    setBusy(true);
    setNeedsLogin(false);
    try {
      const res = await fetch("/api/account/song-like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setCount((c) => c + (data.liked ? 1 : -1));
        setLiked(data.liked);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className={`like-btn${liked ? " liked" : ""}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={liked}
        aria-label={liked ? "Unlike this song" : "Like this song"}
      >
        {liked ? "♥" : "♡"} {count}
      </button>
      {needsLogin && (
        <Link href="/account" className="mut" style={{ fontSize: 10 }}>
          Log in to like →
        </Link>
      )}
    </span>
  );
}
