"use client";

import Link from "next/link";
import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The public `/submit` form (2026-10-06 revision — see
 * claude/next-build.md's "submit, revisited" note): one step, no
 * separate sign-up/login screen. Name is optional, email is required
 * and has to look like a real address (just a spam/typo deterrent,
 * same spirit as the old sign-up form's validation — not an identity
 * check; see /api/submit's own comment for what the email actually
 * does and doesn't prove). Posts straight to /api/submit, which signs
 * up a brand-new email on the spot.
 *
 * Tightened again the same day (2026-10-06 QA sweep): this used to let
 * ANY already-registered email silently overwrite that member's real,
 * publicly-credited pick — no proof required, just typing their
 * address. /api/submit now refuses outright for an existing email
 * instead (see its own comment), and this form surfaces that refusal
 * as a link to /account rather than a dead-end error, since that's
 * genuinely where managing an existing pick belongs — behind the real
 * emailed code, which actually proves who's asking.
 */
export default function PublicSubmitForm({ dropNum }: { dropNum: number }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [needsManual, setNeedsManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [shakeGen, setShakeGen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ mode: "created" | "edited"; title: string; artist: string } | null>(null);

  function fail(message: string, alreadyReg = false) {
    setError(message);
    setAlreadyRegistered(alreadyReg);
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
        fail(data.error ?? "Something went wrong. Try again.", !!data.alreadyRegistered);
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
        One pick for drop {dropNum}. First time? Just add your email and you&rsquo;re set. Already
        have an account here? Manage your pick at{" "}
        <Link href="/account" className="link-btn" style={{ fontSize: "inherit" }}>
          /account
        </Link>{" "}
        instead.
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
            setAlreadyRegistered(false);
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
            setAlreadyRegistered(false);
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
          {alreadyRegistered ? (
            <>
              That email already has an account here —{" "}
              <Link href="/account" className="link-btn" style={{ fontSize: "inherit" }}>
                log in at /account
              </Link>{" "}
              to add or change your pick.
            </>
          ) : (
            error
          )}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Submitting…" : "Submit my pick"}
      </button>
    </form>
  );
}
