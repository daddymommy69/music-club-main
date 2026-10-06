"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * A drop's whole-drop public like toggle (2026-10 release-page redesign
 * — see claude/next-build.md). Separate from the per-song LikeButton:
 * this is "I liked this drop overall," shown in the controls row at the
 * top of the page. Same logged-out handling as LikeButton/RateDropControl
 * — try the request, surface a "log in to like" prompt on a 401 rather
 * than hiding the control.
 */
export default function DropLikeButton({
  dropId,
  initialLiked,
  initialCount,
}: {
  dropId: number;
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
      const res = await fetch("/api/account/drop-like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropId }),
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
        className={`drop-action-btn${liked ? " active" : ""}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={liked}
        aria-label={liked ? "Unlike this drop" : "Like this drop"}
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
