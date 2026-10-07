"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { artistHref } from "@/lib/artistLink";

type SearchResultSite = {
  songId: number;
  dropNum: number;
  likeCount: number;
  rating: { average: number | null; count: number };
} | null;

type SearchResult = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  externalUrl: string | null;
  site: SearchResultSite;
};

/**
 * Browse's one search bar (2026-10-07 — see claude/next-build.md): a
 * live Spotify search, debounced as you type. Any result that matches
 * a song already featured here shows its public stats inline; a
 * "Submit as my pick" action appears on every result, but only while a
 * drop is currently open. If this club's Spotify connection isn't set
 * up (or gets disconnected), the search box is replaced by a plain
 * manual-entry fallback — same link/title/artist fields /submit used
 * to ask for, per the founder's own "I like a fallback" call.
 */
export default function BrowseSearch({ isLoggedIn, dropOpen }: { isLoggedIn: boolean; dropOpen: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [spotifyUnavailable, setSpotifyUnavailable] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedQuery = query.trim();

  // Debounced directly from the input's own change handler rather than
  // an effect keyed on `query` — this is a response to the person
  // typing, not a sync-with-external-system effect, and doing it here
  // means every setState call happens inside a real event handler/async
  // callback instead of an effect body.
  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = value.trim();
    if (!q) return;

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/browse/search?q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => null);
        if (data?.spotifyUnavailable) {
          setSpotifyUnavailable(true);
          setResults([]);
        } else {
          setSpotifyUnavailable(false);
          setResults(data?.results ?? []);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }

  // Unmount-only cleanup so a pending debounce never fires (and calls
  // setState) after this component is gone.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div>
      <input
        type="text"
        className="settings-input"
        placeholder="Search for a song or artist…"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {loading && (
        <p className="mut" style={{ fontSize: 11.5 }}>
          Searching…
        </p>
      )}

      {!loading && trimmedQuery && spotifyUnavailable && (
        <ManualSubmit dropOpen={dropOpen} isLoggedIn={isLoggedIn} />
      )}

      {!loading && trimmedQuery && !spotifyUnavailable && results && results.length === 0 && (
        <p className="mut" style={{ fontSize: 11.5 }}>
          No matches on Spotify for that.
        </p>
      )}

      {!loading && trimmedQuery && !spotifyUnavailable && results && results.length > 0 && (
        <div className="roster-list">
          {results.map((r) => (
            <SearchResultRow key={r.id} result={r} dropOpen={dropOpen} isLoggedIn={isLoggedIn} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({
  result,
  dropOpen,
  isLoggedIn,
}: {
  result: SearchResult;
  dropOpen: boolean;
  isLoggedIn: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "email" | "busy" | "done" | "error">("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submitLoggedIn() {
    setMode("busy");
    setError(null);
    try {
      const res = await fetch("/api/account/listener-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link: result.externalUrl,
          title: result.title,
          artist: result.artist,
          artworkUrl: result.artworkUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't submit that. Try again.");
        setMode("error");
        return;
      }
      setMode("done");
    } catch {
      setError("Couldn't submit that. Try again.");
      setMode("error");
    }
  }

  async function submitAnon(e: React.FormEvent) {
    e.preventDefault();
    setMode("busy");
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          link: result.externalUrl,
          title: result.title,
          artist: result.artist,
          artworkUrl: result.artworkUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't submit that. Try again.");
        setMode("email");
        return;
      }
      setMode("done");
    } catch {
      setError("Couldn't submit that. Try again.");
      setMode("email");
    }
  }

  return (
    <div className="roster-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {result.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.artworkUrl} alt="" className="track-row-art" />
        ) : (
          <div className="track-row-art track-row-art-empty" aria-hidden="true" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="track-title">{result.title}</div>
          <Link href={artistHref(result.artist)} className="track-artist">
            {result.artist}
          </Link>
          {result.site && (
            <div className="mut" style={{ fontSize: 10, marginTop: 2 }}>
              ♥ {result.site.likeCount}
              {result.site.rating.count > 0 && ` · ★ ${result.site.rating.average?.toFixed(1)}`} · featured in
              drop {result.site.dropNum}
            </div>
          )}
        </div>
        {dropOpen && mode === "idle" && (
          <button
            type="button"
            className="btn"
            style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11, flexShrink: 0 }}
            onClick={() => (isLoggedIn ? submitLoggedIn() : setMode("email"))}
          >
            Submit as my pick
          </button>
        )}
        {mode === "busy" && (
          <span className="mut" style={{ fontSize: 11, flexShrink: 0 }}>
            Submitting…
          </span>
        )}
        {mode === "done" && (
          <span style={{ fontSize: 11, flexShrink: 0, color: "var(--accent)" }}>✓ Submitted</span>
        )}
      </div>

      {mode === "email" && (
        <form onSubmit={submitAnon} className="form" style={{ gap: 10 }}>
          <input
            type="text"
            className="settings-input"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="email"
            className="settings-input"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="notice error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
          >
            Submit my pick
          </button>
        </form>
      )}
      {mode === "error" && error && (
        <p className="notice error" style={{ marginTop: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Spotify search isn't available right now (club not connected, or
 * the connection's been revoked) — same manual link/title/artist entry
 * /submit always had, routed through the exact same endpoints. */
function ManualSubmit({ dropOpen, isLoggedIn }: { dropOpen: boolean; isLoggedIn: boolean }) {
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [needsManual, setNeedsManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!dropOpen) {
    return (
      <p className="mut" style={{ fontSize: 11.5 }}>
        Spotify search isn&rsquo;t available right now, and there&rsquo;s no drop open to submit a
        pick to anyway.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) {
      setError("Paste a Spotify or Apple Music link");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(isLoggedIn ? "/api/account/listener-pick" : "/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, link, title, artist }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.needsManualMetadata) setNeedsManual(true);
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p style={{ fontSize: 12.5, color: "var(--accent)" }}>✓ Submitted — thanks for the pick.</p>;
  }

  return (
    <form onSubmit={submit} className="form">
      <p className="mut" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
        Spotify search isn&rsquo;t available right now — add your pick by hand instead.
      </p>
      {!isLoggedIn && (
        <>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
        </>
      )}
      <label>
        Spotify or Apple Music link
        <input
          type="text"
          placeholder="https://open.spotify.com/track/…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
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
        {busy ? "Submitting…" : "Submit my pick"}
      </button>
    </form>
  );
}
