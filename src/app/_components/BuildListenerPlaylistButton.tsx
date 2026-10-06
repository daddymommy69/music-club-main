"use client";

import { useState } from "react";

/**
 * Curator-only "Build & open full playlist on Spotify" action (2026-10
 * release-page redesign — see claude/next-build.md). Only ever rendered
 * for a signed-in curator (the page itself checks that before mounting
 * this) — the API route re-checks anyway, same belt-and-suspenders
 * pattern as every other curator-gated action in this app.
 */
export default function BuildListenerPlaylistButton({
  dropId,
  alreadyBuilt,
}: {
  dropId: number;
  alreadyBuilt: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [builtUrl, setBuiltUrl] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/drops/${dropId}/listener-playlist`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't build the playlist. Try again.");
        return;
      }
      setBuiltUrl(data.url);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Couldn't build the playlist. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (builtUrl) {
    return (
      <a href={builtUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
        Open playlist on Spotify ↗
      </a>
    );
  }

  return (
    <div>
      <button type="button" className="btn btn-outline" onClick={build} disabled={busy}>
        {busy
          ? "Building…"
          : alreadyBuilt
            ? "Rebuild & open playlist on Spotify →"
            : "Build & open full playlist on Spotify →"}
      </button>
      {error && (
        <p className="mut" style={{ fontSize: 11, marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
