"use client";

import { useState } from "react";

export type ListenerPickFormDrop = { num: number; title: string | null };
export type ListenerPickValue = { title: string; artist: string; sourceUrl: string | null };

/**
 * Submit/edit/withdraw this cycle's single Listener Pick — shared
 * between /account (the unified dashboard) and /submit (which now
 * requires a signed-in member instead of the old anonymous name box;
 * see claude/next-build.md and /submit/page.tsx's own comment).
 *
 * Odesli-is-dead judgment call: see /api/account/listener-pick's own
 * comment for the full reasoning. In short — Odesli is attempted
 * first as free enrichment, but when it fails (which is every time,
 * currently), the member types the title/artist themselves rather
 * than being blocked outright.
 */
export default function ListenerPickForm({
  openDrop,
  initialPick,
}: {
  openDrop: ListenerPickFormDrop;
  initialPick: ListenerPickValue | null;
}) {
  const [pick, setPick] = useState(initialPick);
  const [link, setLink] = useState(pick?.sourceUrl ?? "");
  const [title, setTitle] = useState(pick?.title ?? "");
  const [artist, setArtist] = useState(pick?.artist ?? "");
  const [needsManual, setNeedsManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) {
      setError("Paste a Spotify or Apple Music link");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/listener-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link, title, artist }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.needsManualMetadata) setNeedsManual(true);
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setPick({ title: data.song.title, artist: data.song.artist, sourceUrl: data.song.sourceUrl });
      setEditing(false);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/listener-pick", { method: "DELETE" });
      if (res.ok) {
        setPick(null);
        setLink("");
        setTitle("");
        setArtist("");
      }
    } finally {
      setBusy(false);
    }
  }

  if (pick && !editing) {
    return (
      <div className="acc-panel gz-up">
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          You picked <strong>{pick.title}</strong> by {pick.artist} for drop {openDrop.num}.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button
            type="button"
            className="btn"
            style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button type="button" className="link-btn" disabled={busy} onClick={withdraw}>
            {busy ? "…" : "Withdraw"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="form gz-up" noValidate>
      <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
        One pick for drop {openDrop.num}. You can edit or withdraw it any time before the
        drop ships.
      </p>
      <label>
        Spotify or Apple Music link
        <input
          type="text"
          placeholder="https://open.spotify.com/track/…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(null);
          }}
        />
      </label>
      {needsManual && (
        <>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Artist
            <input value={artist} onChange={(e) => setArtist(e.target.value)} />
          </label>
        </>
      )}
      {error && <p className="notice error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : pick ? "Save changes" : "Submit my pick"}
      </button>
      {pick && (
        <button type="button" className="link-btn" onClick={() => setEditing(false)}>
          Cancel
        </button>
      )}
    </form>
  );
}
