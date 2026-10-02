"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDropMeta } from "@/lib/format";

type YouSong = { title: string; artist: string; curatorCredit: string | null };
type YouNote = { curatorName: string; text: string };

type YouDrop = {
  num: number;
  title: string | null;
  publishedAt: string;
  spotifyUrl: string | null;
  appleUrl: string | null;
  songs: YouSong[];
  notes: YouNote[];
};

type Top10Pick = { title: string | null; artist: string | null; link: string };

type YouTop10 = {
  myPick: Top10Pick | null;
};

type YouPageProps = {
  token: string;
  clubName: string;
  name: string | null;
  wantsText: boolean;
  wantsEmail: boolean;
  optedOut: boolean;
  drop: YouDrop | null;
  /** null when there's no open Top 10 window right now — the section
   * doesn't render at all in that case, see src/lib/top10.ts. */
  top10: YouTop10 | null;
};

function channelLabel(wantsText: boolean, wantsEmail: boolean): string {
  if (wantsText && wantsEmail) return "text and email";
  if (wantsText) return "text";
  if (wantsEmail) return "email";
  return "text";
}

export default function YouPage({
  token,
  clubName,
  name,
  wantsText,
  wantsEmail,
  optedOut: initialOptedOut,
  drop,
  top10,
}: YouPageProps) {
  const [optedOut, setOptedOut] = useState(initialOptedOut);
  const [stopping, setStopping] = useState(false);

  async function stopTexting() {
    setStopping(true);
    try {
      const res = await fetch("/api/you/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) setOptedOut(true);
    } finally {
      setStopping(false);
    }
  }

  const channel = channelLabel(wantsText, wantsEmail);
  const stopLabel = wantsText ? "stop texting me" : "stop these emails";

  return (
    <div className="gz-up">
      <div className="wordmark">{clubName}</div>
      <p className="mut" style={{ fontSize: 11.5, marginTop: 4, marginBottom: 24 }}>
        for {name?.trim() || "you"} · sent by {channel}
      </p>

      {drop ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div className="numeral" style={{ fontSize: 44 }}>
              {String(drop.num).padStart(2, "0")}
            </div>
            <div className="mut" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
              your new playlist is up
            </div>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.4, letterSpacing: "-0.02em", margin: "10px 0 6px" }}>
            {drop.title ?? `Drop ${drop.num}`}
          </div>
          <p className="mut" style={{ fontSize: 11, marginBottom: 20 }}>
            {formatDropMeta(new Date(drop.publishedAt), drop.songs.length)}
          </p>

          <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
            {drop.spotifyUrl && (
              <a className="btn btn-accent" href={drop.spotifyUrl} target="_blank" rel="noreferrer">
                Spotify ↗
              </a>
            )}
            {drop.appleUrl && (
              <a className="btn btn-outline" href={drop.appleUrl} target="_blank" rel="noreferrer">
                Apple Music ↗
              </a>
            )}
          </div>

          <div className="tracklist-header">
            <span className="label">The songs</span>
            <span className="label">Picked by</span>
          </div>
          <hr className="hairline" style={{ margin: "0 0 4px" }} />
          <div>
            {drop.songs.map((song, i) => (
              <div className="track-row" key={i}>
                <div className="track-info">
                  <div className="track-title">{song.title}</div>
                  <div className="track-artist">{song.artist}</div>
                </div>
                <div className="track-credit">{song.curatorCredit ?? ""}</div>
              </div>
            ))}
          </div>

          {drop.notes.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 30, marginBottom: 12 }}>
                What they were going for
              </div>
              <div className="curator-notes" style={{ marginTop: 0 }}>
                {drop.notes.map((note, i) => (
                  <div className="curator-note" key={i}>
                    <div className="curator-name">{note.curatorName}</div>
                    <div className="note-text">{note.text}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="empty-state">
          Your first drop is coming — you&rsquo;ll get a link the moment it ships.
        </div>
      )}

      {top10 && (
        <>
          <div className="label" style={{ marginTop: 30, marginBottom: 12 }}>
            Subscriber Top 10
          </div>
          <Top10Submit token={token} initialPick={top10.myPick} />
        </>
      )}

      <div className="label" style={{ marginTop: 30, marginBottom: 12 }}>
        Your clubs
      </div>
      <div className="roster-list">
        <div className="roster-row">
          <span className="roster-name">{clubName}</span>
          <span className="roster-meta">subscribed</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid var(--ln)",
        }}
      >
        {optedOut ? (
          <span className="mut" style={{ fontSize: 11.5 }}>
            You&rsquo;re not getting drops from this club right now.
          </span>
        ) : (
          <>
            <span className="mut" style={{ fontSize: 11.5 }}>
              you get this by {channel}
            </span>
            <button type="button" className="link-btn" onClick={stopTexting} disabled={stopping}>
              {stopping ? "…" : stopLabel}
            </button>
          </>
        )}
      </div>

      <hr className="hairline" style={{ marginTop: 30 }} />
      <p className="mut" style={{ fontSize: 11, lineHeight: 1.6 }}>
        This page is yours — the link in your email always opens the newest drop.
      </p>
      <Link href="/releases" className="link-btn" style={{ display: "inline-block", marginTop: 10 }}>
        Every drop so far →
      </Link>
    </div>
  );
}

/** One song, once, no changes after — same paste-a-link shape as
 * /submit, but this vote counts toward the Subscriber Top 10 rather
 * than going into a curator's pile, so there's no name field and no
 * duplicate-song warning (two people picking the same song is the
 * entire point). */
function Top10Submit({ token, initialPick }: { token: string; initialPick: Top10Pick | null }) {
  const [link, setLink] = useState("");
  const [pick, setPick] = useState(initialPick);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) {
      setError("Paste a Spotify or Apple Music link");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/you/top10", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, link: link.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setPick(data.entry);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (pick) {
    return (
      <div className="acc-panel">
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          You&rsquo;re in — you picked{" "}
          <strong>{pick.title && pick.artist ? `${pick.title} by ${pick.artist}` : pick.link}</strong>.
        </p>
        <p className="mut" style={{ fontSize: 11, marginTop: 6 }}>
          One pick per drop, no changes — results show up on the archive once voting closes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>
        Pick one song for the club-wide Top 10. First pick locks in — no changes after.
      </p>
      <label>
        Spotify or Apple Music link
        <input
          type="text"
          placeholder="https://open.spotify.com/track/..."
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(null);
          }}
        />
      </label>
      {error && <p className="notice error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit my pick"}
      </button>
    </form>
  );
}
