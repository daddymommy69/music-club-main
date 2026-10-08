"use client";

import { useState } from "react";

type TallyRow = { title: string | null; artist: string | null; link: string; votes: number };

export type Top10CardProps = {
  dropNum: number;
  phase: "pending" | "open" | "closed";
  opensAt: string;
  closesAt: string;
  tally: TallyRow[];
  hitThreshold: boolean;
  spotifyUrl: string | null;
  appleUrl: string | null;
};

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

/** Curator-facing Top 10 status for the currently-most-recent published
 * drop — live tally while voting is open, paste-the-playlist-link step
 * once it closes with 10+ unique songs. Unlike the public archive
 * (src/app/_components/DropDetail.tsx), curators always see real vote
 * counts — the "hide until every entry has 2+ votes" rule is a public-
 * facing courtesy, not something curators need shielded from. */
export default function Top10Card({
  phase,
  opensAt,
  closesAt,
  tally,
  hitThreshold,
  spotifyUrl: initialSpotifyUrl,
  appleUrl: initialAppleUrl,
}: Top10CardProps) {
  const [spotifyUrl, setSpotifyUrl] = useState(initialSpotifyUrl ?? "");
  const [appleUrl, setAppleUrl] = useState(initialAppleUrl ?? "");
  const [saved, setSaved] = useState(!!(initialSpotifyUrl || initialAppleUrl));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalVotes = tally.reduce((sum, row) => sum + row.votes, 0);

  async function savePlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!spotifyUrl.trim() && !appleUrl.trim()) {
      setError("Paste at least one playlist link");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/top10", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotifyUrl: spotifyUrl.trim() || undefined,
          appleUrl: appleUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {phase === "pending" && (
        <div className="empty-state" style={{ padding: "16px 0" }}>
          Voting opens in {daysUntil(opensAt)} day{daysUntil(opensAt) === 1 ? "" : "s"}.
        </div>
      )}

      {phase === "open" && (
        <div className="acc-panel">
          <p style={{ fontSize: 13 }}>
            Voting is open — {totalVotes} vote{totalVotes === 1 ? "" : "s"} so far.
          </p>
          <p className="mut" style={{ fontSize: 11, marginTop: 6 }}>
            Closes in {daysUntil(closesAt)} day{daysUntil(closesAt) === 1 ? "" : "s"}.
          </p>
        </div>
      )}

      {phase === "closed" && (
        <>
          {tally.length === 0 ? (
            <div className="empty-state" style={{ padding: "16px 0" }}>
              Nobody voted this cycle.
            </div>
          ) : (
            <div className="roster-list" style={{ marginBottom: 16 }}>
              {tally.map((row, i) => (
                <div className="roster-row" key={i}>
                  <span className="roster-name">
                    {i + 1}. {row.title && row.artist ? `${row.title} — ${row.artist}` : row.link}
                  </span>
                  <span className="roster-meta">
                    {row.votes} vote{row.votes === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!hitThreshold ? (
            <p className="mut" style={{ fontSize: 11.5 }}>
              Only {tally.length} unique song{tally.length === 1 ? "" : "s"} — under the 10 needed
              to build a playlist. The result is already showing on the archive.
            </p>
          ) : saved ? (
            <p className="mut" style={{ fontSize: 11.5 }}>
              Playlist link{spotifyUrl && appleUrl ? "s" : ""} saved — subscribers have been notified.
            </p>
          ) : (
            <form onSubmit={savePlaylist} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p className="mut" style={{ fontSize: 11.5, marginBottom: 2 }}>
                10+ unique songs — build the playlist and paste the link(s) below. Saving sends the
                Top 10 announcement to subscribers.
              </p>
              <input
                type="text"
                className="settings-input"
                value={spotifyUrl}
                onChange={(e) => setSpotifyUrl(e.target.value)}
                placeholder="Spotify link"
              />
              <input
                type="text"
                className="settings-input"
                value={appleUrl}
                onChange={(e) => setAppleUrl(e.target.value)}
                placeholder="Apple Music link"
              />
              {error && <p className="notice error">{error}</p>}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save & notify subscribers"}
              </button>
            </form>
          )}
        </>
      )}
    </>
  );
}
