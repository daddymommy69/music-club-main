"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * A drop's private save/bookmark toggle (2026-10 release-page redesign
 * — see claude/next-build.md). A private bookmark onto the member's
 * own account — distinct from DropLikeButton's public count, and
 * distinct from the "Open playlist on Spotify ↗" link next to it:
 * there's no visitor-side Spotify OAuth, so this never touches a
 * member's real Spotify library, just this app's own record of "I
 * wanted to come back to this." Same logged-out handling as the other
 * drop/song controls.
 */
export default function DropSaveButton({
  dropId,
  initialSaved,
}: {
  dropId: number;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function toggle() {
    setBusy(true);
    setNeedsLogin(false);
    try {
      const res = await fetch("/api/account/drop-save", {
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
        setSaved(data.saved);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className={`drop-action-btn${saved ? " active" : ""}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? "Unsave this drop" : "Save this drop"}
      >
        {saved ? "★" : "☆"} {saved ? "Saved" : "Save"}
      </button>
      {needsLogin && (
        <Link href="/account" className="mut" style={{ fontSize: 10 }}>
          Log in to save →
        </Link>
      )}
    </span>
  );
}
