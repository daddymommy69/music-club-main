"use client";

import { useState } from "react";
import { isValidMusicLink } from "@/lib/musicLink";

const LINK_ERROR = "That link doesn't look right — try pasting it again.";
const NAME_ERROR = "Name is required";

type DuplicateInfo = { title: string | null; artist: string | null };

export default function SubmitOpen({
  nextDropNum,
  initialCount,
}: {
  nextDropNum: number;
  initialCount: number;
}) {
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakeGen, setShakeGen] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);

  async function doSubmit(force: boolean) {
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link, name, force }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? LINK_ERROR);
        setShakeGen((g) => g + 1);
        return;
      }
      if (data.duplicate) {
        setDuplicate(data.existing ?? {});
        return;
      }

      setCount((c) => c + 1);
      setSuccess(true);
    } catch {
      setError("Something went wrong. Try again.");
      setShakeGen((g) => g + 1);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError(NAME_ERROR);
      setShakeGen((g) => g + 1);
      return;
    }
    if (!link.trim() || !isValidMusicLink(link)) {
      setError(LINK_ERROR);
      setShakeGen((g) => g + 1);
      return;
    }

    setDuplicate(null);
    await doSubmit(false);
  }

  if (success) {
    return (
      <div className="signup-success gz-up">
        <div className="success-circle gz-pop">✓</div>
        <div className="success-headline" style={{ fontSize: 19 }}>
          Added! Thanks for the pick.
        </div>
        <p className="mut" style={{ fontSize: 13, lineHeight: 1.65 }}>
          It&rsquo;s in the pile for drop {nextDropNum}. The curators listen to
          everything before the playlist goes out.
        </p>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setLink("");
            setDuplicate(null);
            setSuccess(false);
          }}
        >
          Submit another →
        </button>
      </div>
    );
  }

  return (
    <div className="gz-up">
      <p className="mut submit-count">
        {count} {count === 1 ? "person has" : "people have"} submitted so far this cycle
      </p>

      {duplicate && (
        <div className="duplicate-notice gz-up">
          <p style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            {duplicate.title && duplicate.artist
              ? `"${duplicate.title}" by ${duplicate.artist} is already in for this drop.`
              : "This link is already in for this drop."}{" "}
            Still want to add it?
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
              disabled={submitting}
              onClick={() => doSubmit(true)}
            >
              {submitting ? "Adding…" : "Add it anyway"}
            </button>
            <button type="button" className="link-btn" onClick={() => setDuplicate(null)}>
              Never mind
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form" noValidate>
        <label>
          Your name
          <input
            placeholder="So the curators know who to thank"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
              setDuplicate(null);
            }}
          />
        </label>
        <label>
          Spotify or Apple Music link
          <input
            type="url"
            placeholder="https://open.spotify.com/track/…"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setError(null);
              setDuplicate(null);
            }}
          />
        </label>

        {error && (
          <p key={`link-${shakeGen}`} className="notice error gz-shake">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Adding…" : "Add it"}
        </button>
      </form>
    </div>
  );
}
