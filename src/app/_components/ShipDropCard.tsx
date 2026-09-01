"use client";

import { useState } from "react";

export type ShipDropCardProps = {
  dropNum: number;
  title: string | null;
  pickCount: number;
};

/**
 * The "finish the drop" step — paste the final playlist link(s) once
 * curators are done picking in /room, and ship it. Same paste-the-link
 * pattern as Top10Card, and the same one-shot behavior: once this
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

  async function ship(e: React.FormEvent) {
    e.preventDefault();
    if (!spotifyUrl.trim() && !appleUrl.trim()) {
      setError("Paste at least one playlist link");
      return;
    }
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
        </div>
      ) : (
        <form onSubmit={ship} className="form">
          <p className="mut" style={{ fontSize: 11.5, marginBottom: 10 }}>
            {pickCount} pick{pickCount === 1 ? "" : "s"} so far. Once you&rsquo;ve built the
            playlist, paste the link(s) below to publish this drop and text/email everyone —
            there&rsquo;s no separate step after this.
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
            Spotify link
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
