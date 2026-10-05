"use client";

import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The public `/submit` form (2026-10-06 revision — see
 * claude/next-build.md's "submit, revisited" note): one step, no
 * separate sign-up/login screen. Name is optional, email is required
 * and has to look like a real address (just a spam/typo deterrent,
 * same spirit as the old sign-up form's validation — not an identity
 * check; see /api/submit's own comment for what the email actually
 * does and doesn't prove). Posts straight to /api/submit, which
 * creates-or-edits this cycle's pick for whatever member that email
 * belongs to.
 *
 * Deliberately does NOT try to pre-fill a returning member's existing
 * pick — that would mean either exposing "what did email X submit"
 * to anyone who types that email (a real privacy leak), or requiring
 * a real login first (which defeats the point of this simple form).
 * Resubmitting the same email + a new link just overwrites the old
 * pick; `/account` (behind the emailed code) is where someone manages
 * their existing submission with full context instead.
 */
export default function PublicSubmitForm({ dropNum }: { dropNum: number }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [needsManual, setNeedsManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeGen, setShakeGen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ mode: "created" | "edited"; title: string; artist: string } | null>(null);

  function fail(message: string) {
    setError(message);
    setShakeGen((g) => g + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      fail("Check that address — it's missing something");
      return;
    }
    if (!link.trim()) {
      fail("Paste a Spotify or Apple Music link");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, link, title, artist }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.needsManualMetadata) setNeedsManual(true);
        fail(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setResult({ mode: data.mode, title: data.song.title, artist: data.song.artist });
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="signup-success gz-up">
        <div className="success-circle gz-pop">✓</div>
        <div className="success-headline">
          {result.mode === "edited" ? "Updated!" : "Added! Thanks for the pick."}
        </div>
        <p className="mut" style={{ fontSize: 13, lineHeight: 1.65 }}>
          <strong>{result.title}</strong> by {result.artist} is in for drop {dropNum}.
        </p>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setResult(null);
            setLink("");
            setTitle("");
            setArtist("");
            setNeedsManual(false);
          }}
        >
          Submit another / change this one
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="form gz-up" noValidate>
      <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
        One pick for drop {dropNum}. Just needs a real email so we know who it&rsquo;s from —
        submitting again with the same address updates your pick instead of adding a second one.
      </p>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
      </label>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder="you@example.com"
        />
      </label>
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
      {error && (
        <p key={`e-${shakeGen}`} className="notice error gz-shake">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Submitting…" : "Submit my pick"}
      </button>
    </form>
  );
}
