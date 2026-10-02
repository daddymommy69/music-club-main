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
    <div style={{ marginTop: 32 }}>
      <p className="label" style={{ marginBottom: 14 }}>
        Ship drop {dropNum}
      </p>

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
        <form onSubmit={ship} className="form">
          <p className="mut" style={{ fontSize: 11.5, marginBottom: 10 }}>
            {pickCount} pick{pickCount === 1 ? "" : "s"} so far. Spotify builds itself
            automatically from the picks — paste an Apple Music link below (and a Spotify link
            too, only if you want to override the auto-build). Ship publishes this drop and
            texts/emails everyone, no separate step after this.
          </p>
          <label>
            Title (optional)
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give this drop a name"
            />
          </label>
          <label>
            Spotify link (optional — leave blank to auto-build)
            <input
              type="text"
              value={spotifyUrl}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              placeholder="https://open.spotify.com/playlist/..."
            />
          </label>
          <label>
            Apple Music link
            <input
              type="text"
              value={appleUrl}
              onChange={(e) => setAppleUrl(e.target.value)}
              placeholder="https://music.apple.com/playlist/..."
            />
          </label>
          {error && <p className="notice error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={shipping}>
            {shipping ? "Shipping…" : `Ship drop ${dropNum}`}
          </button>
        </form>
      )}
    </div>
  );
}
