"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { artistHref } from "@/lib/artistLink";
import PlayableArt from "./PlayableArt";

type SearchResultSite = {
  songId: number;
  dropNum: number;
  likeCount: number;
  rating: { average: number | null; count: number };
} | null;

type SpotifyResult = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  externalUrl: string | null;
  site: SearchResultSite;
};

/** Shape of a /api/browse/search?source=site row (src/lib/browse.ts's
 * SiteSearchResult) — already-featured songs, so every stat is already
 * known, no separate site-match lookup the way a Spotify result needs. */
type SiteResult = {
  songId: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUri: string | null;
  dropNum: number;
  likeCount: number;
  rating: { average: number | null; count: number };
};

type SearchSource = "site" | "spotify";

/** Remembers the visitor's last-used tab across visits (2026-10-08
 * "drop control + playback" round — founder's own ask — see
 * claude/next-build.md). Per-browser, not account-wide — there's no
 * server-side place this belongs, and it's a pure UI convenience, so
 * localStorage is the right (and only) place for it. Wrapped in
 * try/catch since a private window or blocked site data can make this
 * throw; the search still works either way, it just won't remember. */
const SOURCE_STORAGE_KEY = "gz-browse-search-source";

function readStoredSource(): SearchSource {
  try {
    const stored = window.localStorage.getItem(SOURCE_STORAGE_KEY);
    return stored === "site" ? "site" : "spotify";
  } catch {
    return "spotify";
  }
}

function storeSource(source: SearchSource) {
  try {
    window.localStorage.setItem(SOURCE_STORAGE_KEY, source);
  } catch {
    // Best-effort — nothing to recover, the toggle still works this visit.
  }
}

/**
 * Browse's one search bar (2026-10-07 — see claude/next-build.md),
 * extended 2026-10-08 with a two-tab switch between searching this
 * site's own already-featured songs and live Spotify (the founder's
 * own ask — "is there a way to toggle the search between the site and
 * the internet easily"). One box, one query, the tab just decides
 * where it looks — switching tabs re-runs whatever's already typed.
 * Spotify stays the default for a first-time visitor; the last tab
 * used is remembered after that (readStoredSource above). The
 * Spotify-search path still falls back to a plain manual-entry form
 * when this club's Spotify connection isn't available — that's
 * unrelated to (and unaffected by) this tab switch, since the This
 * Site tab never touches Spotify at all and can never be "unavailable."
 */
export default function BrowseSearch({ isLoggedIn, dropOpen }: { isLoggedIn: boolean; dropOpen: boolean }) {
  const [source, setSource] = useState<SearchSource>("spotify");
  const [query, setQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyResult[] | null>(null);
  const [siteResults, setSiteResults] = useState<SiteResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [spotifyUnavailable, setSpotifyUnavailable] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedQuery = query.trim();

  // Hydrate the remembered tab after mount — server-rendered markup
  // has no localStorage to read, so this always starts as "spotify"
  // and corrects itself right after mount instead of reading
  // localStorage during render (which would mismatch the server-
  // rendered HTML). A deliberate one-time exception to the usual
  // "don't setState in an effect" rule — there's no external system to
  // subscribe to here, just a value only the browser has.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource(readStoredSource());
  }, []);

  async function runSearch(q: string, src: SearchSource) {
    setLoading(true);
    try {
      const res = await fetch(`/api/browse/search?q=${encodeURIComponent(q)}&source=${src}`);
      const data = await res.json().catch(() => null);
      if (src === "site") {
        setSiteResults(data?.results ?? []);
      } else if (data?.spotifyUnavailable) {
        setSpotifyUnavailable(true);
        setSpotifyResults([]);
      } else {
        setSpotifyUnavailable(false);
        setSpotifyResults(data?.results ?? []);
      }
    } catch {
      if (src === "site") setSiteResults([]);
      else setSpotifyResults([]);
    } finally {
      setLoading(false);
    }
  }

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
    debounceRef.current = setTimeout(() => runSearch(q, source), 350);
  }

  function switchSource(next: SearchSource) {
    if (next === source) return;
    setSource(next);
    storeSource(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trimmedQuery) runSearch(trimmedQuery, next);
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
      <div className="search-toggle" role="tablist" aria-label="Search">
        <button
          type="button"
          role="tab"
          aria-selected={source === "spotify"}
          className={`search-toggle-btn${source === "spotify" ? " active" : ""}`}
          onClick={() => switchSource("spotify")}
        >
          Spotify
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === "site"}
          className={`search-toggle-btn${source === "site" ? " active" : ""}`}
          onClick={() => switchSource("site")}
        >
          This site
        </button>
      </div>

      <input
        type="text"
        className="settings-input"
        placeholder={source === "site" ? "Search songs already featured here…" : "Search for a song or artist…"}
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {loading && (
        <p className="mut" style={{ fontSize: 11.5 }}>
          Searching…
        </p>
      )}

      {!loading && trimmedQuery && source === "spotify" && spotifyUnavailable && (
        <ManualSubmit dropOpen={dropOpen} isLoggedIn={isLoggedIn} />
      )}

      {!loading && trimmedQuery && source === "spotify" && !spotifyUnavailable && spotifyResults && spotifyResults.length === 0 && (
        <p className="mut" style={{ fontSize: 11.5 }}>
          No matches on Spotify for that.
        </p>
      )}

      {!loading && trimmedQuery && source === "spotify" && !spotifyUnavailable && spotifyResults && spotifyResults.length > 0 && (
        <div className="roster-list">
          {spotifyResults.map((r) => (
            <SpotifyResultRow key={r.id} result={r} dropOpen={dropOpen} isLoggedIn={isLoggedIn} />
          ))}
        </div>
      )}

      {!loading && trimmedQuery && source === "site" && siteResults && siteResults.length === 0 && (
        <p className="mut" style={{ fontSize: 11.5 }}>
          Nothing featured here yet matches that.
        </p>
      )}

      {!loading && trimmedQuery && source === "site" && siteResults && siteResults.length > 0 && (
        <div className="roster-list">
          {siteResults.map((r) => (
            <SiteResultRow key={r.songId} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteResultRow({ result }: { result: SiteResult }) {
  return (
    <div className="roster-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PlayableArt
          spotifyUri={result.spotifyUri}
          artworkUrl={result.artworkUrl}
          title={result.title}
          artist={result.artist}
          className="track-row-art"
          fallbackClassName="track-row-art track-row-art-empty"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/drop/${result.dropNum}`} className="track-title">
            {result.title}
          </Link>
          <Link href={artistHref(result.artist)} className="track-artist">
            {result.artist}
          </Link>
          <div className="mut" style={{ fontSize: 10, marginTop: 2 }}>
            ♥ {result.likeCount}
            {result.rating.count > 0 && ` · ★ ${result.rating.average?.toFixed(1)}`} · drop {result.dropNum}
          </div>
        </div>
      </div>
    </div>
  );
}

function SpotifyResultRow({
  result,
  dropOpen,
  isLoggedIn,
}: {
  result: SpotifyResult;
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
        {/* result.id is Spotify's own bare track id (src/lib/spotify.ts's
            searchSpotifyTracks) — reconstructed as a full URI here since
            that's the shape PlayableArt/every other call site takes. */}
        <PlayableArt
          spotifyUri={`spotify:track:${result.id}`}
          artworkUrl={result.artworkUrl}
          title={result.title}
          artist={result.artist}
          className="track-row-art"
          fallbackClassName="track-row-art track-row-art-empty"
        />
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
 * /submit always had, routed through the exact same endpoints. Only
 * ever shown under the Spotify tab — the This Site tab never touches
 * Spotify at all, so it has no equivalent "unavailable" state. */
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
