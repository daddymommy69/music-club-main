"use client";

import { useState } from "react";

export type ShipDropCardProps = {
  dropNum: number;
  title: string | null;
  pickCount: number;
};

type SpotifyAutoBuild = {
  matchedCount: number;
  totalCount: number;
  unmatchedTitles: string[];
} | null;

/**
 * The "finish the drop" step — once curators are done picking in /room,
 * ship it. The Spotify playlist auto-builds from this drop's songs when
 * that field's left blank (search-match each song, create a public
 * playlist, upload a matching cover) — pasting a link here still works
 * and always wins, as the manual fallback for whenever auto-build isn't
 * connected or you want to override it. Apple Music stays a manual
 * paste, same as always. Same one-shot behavior either way: once this
 * succeeds the drop is published and the release message is already
 * sent, so there's nothing left to edit here afterward (the next load of
 * /overview simply won't have a ship candidate anymore).
 */
export default function ShipDropCard({ dropNum, title: initialTitle, pickCount }: ShipDropCardProps) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [appleUrl, setAppleUrl] = useState("");
  const [shipping, setShipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipped, setShipped] = useState<{ sent: number; total: number } | null>(null);
  const [spotifyAutoBuild, setSpotifyAutoBuild] = useState<SpotifyAutoBuild>(null);
  // Collapsed by default (2026-10-08 curator tools redesign — see
  // claude/next-build.md): most ships leave both links blank and let
  // Spotify auto-build, so the two paste-a-link fields are clutter on
  // every view that doesn't need them. The disclosure opens itself if
  // there's already a link to show (e.g. after a validation error).
  const [linksOpen, setLinksOpen] = useState(false);

  async function ship(e: React.FormEvent) {
    e.preventDefault();
    setShipping(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/ship", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          spotifyUrl: spotifyUrl.trim() || undefined,
          appleUrl: appleUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setShipped({ sent: data.sent ?? 0, total: data.total ?? 0 });
      setSpotifyAutoBuild(data.spotifyAutoBuild ?? null);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setShipping(false);
    }
  }

  return (
    <>
      {shipped ? (
        <div className="acc-panel">
          <p style={{ fontSize: 13 }}>
            Drop {dropNum} is live — sent to {shipped.sent} of {shipped.total} subscribers.
          </p>
          {spotifyAutoBuild && (
            <p style={{ fontSize: 12, marginTop: 8 }}>
              Spotify playlist built — matched {spotifyAutoBuild.matchedCount} of{" "}
              {spotifyAutoBuild.totalCount} song{spotifyAutoBuild.totalCount === 1 ? "" : "s"}.
              {spotifyAutoBuild.unmatchedTitles.length > 0 && (
                <>
                  {" "}
                  Couldn&rsquo;t find:{" "}
                  <span className="mut">{spotifyAutoBuild.unmatchedTitles.join(", ")}</span>.
                </>
              )}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={ship} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="mut" style={{ fontSize: 11.5, marginBottom: 2 }}>
            {pickCount} pick{pickCount === 1 ? "" : "s"} so far. Spotify builds itself
            automatically from the picks. Ship publishes this drop and texts/emails everyone, no
            separate step after this.
          </p>
          <input
            type="text"
            className="settings-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give this drop a name (optional)"
          />

          {linksOpen ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="text"
                className="settings-input"
                value={spotifyUrl}
                onChange={(e) => setSpotifyUrl(e.target.value)}
                placeholder="Spotify link (optional — leave blank to auto-build)"
              />
              <input
                type="text"
                className="settings-input"
                value={appleUrl}
                onChange={(e) => setAppleUrl(e.target.value)}
                placeholder="Apple Music link (optional)"
              />
            </div>
          ) : (
            <button type="button" className="link-btn" onClick={() => setLinksOpen(true)} style={{ alignSelf: "flex-start" }}>
              + add Spotify/Apple Music links manually
            </button>
          )}

          {error && <p className="notice error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={shipping}>
            {shipping ? "Shipping…" : `Ship drop ${dropNum}`}
          </button>
        </form>
      )}
    </>
  );
}
