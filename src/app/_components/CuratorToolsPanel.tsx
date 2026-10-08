"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isValidMusicLink } from "@/lib/musicLink";
import { formatRelativeTime } from "@/lib/relativeTime";
import FallbackImg from "./FallbackImg";
import ShipDropCard from "./ShipDropCard";
import Top10Card, { type Top10CardProps } from "./Top10Card";

/**
 * The curator workspace (formerly the standalone /room + /overview
 * pages). Rendered as its own "Curator tools" tab on /account
 * (2026-10-08, this round — see claude/next-build.md), shown only to
 * approved curators. Every control here posts to the same API routes
 * it always has.
 *
 * Redesigned 2026-10-08 (see claude/next-build.md, "curator tools
 * redesign") after the founder found the previous version visually
 * messy and genuinely confusing to even start using. Structural
 * changes from before:
 *   1. Adding a pick is now a live Spotify search-and-select (same
 *      pattern Browse's search bar already uses), not a paste-a-link
 *      box — with artwork, and no dependence on the long-dead Odesli
 *      lookup. Falls back to the old paste-a-link form automatically
 *      if this club's Spotify connection isn't available.
 *   2. The Columns/Stream view toggle, the per-curator note box, and
 *      the curator comment thread are all gone — unused by this team,
 *      per the founder's own answer during the redesign's requirements
 *      round. "This cycle's picks" is now one flat, removable list.
 *   3. One button-weight rule everywhere: a solid .btn-primary is
 *      reserved for exactly one true call-to-action per card (Add,
 *      Start drop, Ship drop); everything repeatable or secondary
 *      (Quick-add, Remove) is outlined or plain text. Boxes follow the
 *      same idea — .ct-card is a plain neutral card, .ct-card-emphasis
 *      (teal border) is reserved for Start/Ship, and the pile/picks/
 *      curators list no longer nest a second teal box inside another.
 *   4. No longer its own collapsible section with a "Curator tools"
 *      header of its own — now that it lives on a dedicated tab, that
 *      header/collapse was a redundant second toggle on top of the tab
 *      switch itself. Add/picks/pile/Start/Ship always render as soon
 *      as the tab is open; only Curators and Top 10 (checked less
 *      often) stay as their own small disclosures.
 */

type Pick = {
  id: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  sourceUrl: string | null;
  curatorCredit: string;
};

type PileItem = {
  id: number;
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
  link: string;
  submittedBy: string | null;
  submittedAt: string;
  pulledAt: string | null;
};

type RosterCurator = {
  id: number;
  name: string;
  picksThisCycle: number;
  picksLifetime: number;
  joinedAt: string;
};

type ShipCandidate = { dropNum: number; title: string | null; pickCount: number };

export type CuratorToolsPanelProps = {
  dropNum: number;
  isManual: boolean;
  daysUntilNext: number | null;
  hasOpenDrop: boolean;
  subscriberCount: number;
  picks: Pick[];
  pile: PileItem[];
  roster: RosterCurator[];
  shipCandidate: ShipCandidate | null;
  top10: Top10CardProps | null;
};

type DuplicateInfo = { title: string | null; artist: string | null };

const LINK_ERROR = "That link doesn't look right — try pasting it again.";

function timeLabel(isManual: boolean, daysUntilNext: number | null) {
  if (isManual) return "no scheduled date";
  if (daysUntilNext === null) return "timing unknown";
  if (daysUntilNext === 0) return "shipping today";
  return `${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"}`;
}

function joinedLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function CuratorToolsPanel({
  dropNum,
  isManual,
  daysUntilNext,
  hasOpenDrop,
  subscriberCount,
  picks,
  pile,
  roster,
  shipCandidate,
  top10,
}: CuratorToolsPanelProps) {
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  return (
    <div className="gz-up">
      <div className="stat-row gz-up">
        <Stat label="Drop" value={String(dropNum)} />
        <Stat label="Remaining" value={timeLabel(isManual, daysUntilNext)} />
        <Stat label="Subscribers" value={String(subscriberCount)} />
        <Stat label="Submissions" value={String(pile.length)} />
      </div>

      {!hasOpenDrop && <StartDropCard dropNum={dropNum} onStarted={refresh} />}

      {hasOpenDrop && (
        <>
          <AddPick onAdded={refresh} />
          <PicksCard picks={picks} onRemoved={refresh} />
        </>
      )}

      <PileCard pile={pile} hasOpenDrop={hasOpenDrop} onAdded={refresh} />

      <CuratorsDisclosure roster={roster} />

      {shipCandidate && (
        <div className="ct-card-emphasis" style={{ marginTop: 20 }}>
          <p className="label" style={{ marginBottom: 10 }}>
            Ship drop {shipCandidate.dropNum}
          </p>
          <ShipDropCard
            dropNum={shipCandidate.dropNum}
            title={shipCandidate.title}
            pickCount={shipCandidate.pickCount}
          />
        </div>
      )}

      {top10 && <Top10Disclosure top10={top10} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function StartDropCard({ dropNum, onStarted }: { dropNum: number; onStarted: () => void }) {
  const [title, setTitle] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/start-drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      onStarted();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="ct-card-emphasis gz-up" style={{ marginTop: 20 }}>
      <p className="label" style={{ marginBottom: 10 }}>
        Start drop {dropNum}
      </p>
      <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>
        Nothing&rsquo;s open right now — search and the submission pile below stay off until a
        drop exists to pick into.
      </p>
      <form onSubmit={start} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          className="settings-input"
          placeholder="Title (optional, changeable later)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={starting}>
          {starting ? "Starting…" : `Start drop ${dropNum}`}
        </button>
      </form>
      {error && (
        <p className="notice error" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}

type SearchResult = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  externalUrl: string | null;
};

/** Live Spotify search, debounced as you type — same pattern as
 * Browse's search bar (src/app/_components/BrowseSearch.tsx). Falls
 * back to ManualAddPick (the original paste-a-link flow) whenever this
 * club's Spotify connection isn't available, so a curator is never
 * stuck either way. */
function AddPick({ onAdded }: { onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [spotifyUnavailable, setSpotifyUnavailable] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = value.trim();
    if (!q) {
      setResults(null);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/room/search?q=${encodeURIComponent(q)}`);
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

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const trimmed = query.trim();

  function handleAdded() {
    setQuery("");
    setResults(null);
    onAdded();
  }

  return (
    <div className="ct-card" style={{ marginTop: 20 }}>
      <p className="label" style={{ marginBottom: 10 }}>
        Add a pick
      </p>
      <input
        type="text"
        className="settings-input"
        placeholder="Search Spotify for a song…"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
      />

      {loading && (
        <p className="mut" style={{ fontSize: 11.5, marginTop: 10 }}>
          Searching…
        </p>
      )}

      {!loading && trimmed && spotifyUnavailable && (
        <div style={{ marginTop: 14 }}>
          <ManualAddPick onAdded={handleAdded} />
        </div>
      )}

      {!loading && trimmed && !spotifyUnavailable && results && results.length === 0 && (
        <p className="mut" style={{ fontSize: 11.5, marginTop: 10 }}>
          No matches on Spotify for that.
        </p>
      )}

      {!loading && trimmed && !spotifyUnavailable && results && results.length > 0 && (
        <div className="roster-list" style={{ marginTop: 10 }}>
          {results.map((r) => (
            <SearchResultRow key={r.id} result={r} onAdded={handleAdded} />
          ))}
        </div>
      )}

      {!trimmed && (
        <p className="mut" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
          No links to paste — search finds the song, and its artwork, for you.
        </p>
      )}
    </div>
  );
}

function SearchResultRow({ result, onAdded }: { result: SearchResult; onAdded: () => void }) {
  const [state, setState] = useState<"idle" | "adding" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);

  async function add(force: boolean) {
    setState("adding");
    setError(null);
    try {
      const res = await fetch("/api/room/picks/spotify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotifyId: result.id,
          title: result.title,
          artist: result.artist,
          artworkUrl: result.artworkUrl,
          externalUrl: result.externalUrl,
          force,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setState("error");
        return;
      }
      if (data.duplicate) {
        setDuplicate(data.existing ?? {});
        setState("idle");
        return;
      }
      onAdded();
    } catch {
      setError("Something went wrong. Try again.");
      setState("error");
    }
  }

  return (
    <div className="roster-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {result.artworkUrl ? (
          <FallbackImg
            src={result.artworkUrl}
            className="track-row-art"
            fallbackClassName="track-row-art track-row-art-empty"
          />
        ) : (
          <div className="track-row-art track-row-art-empty" aria-hidden="true" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="track-title">{result.title}</div>
          <div className="track-artist">{result.artist}</div>
        </div>
        {state === "idle" && (
          <button
            type="button"
            className="btn"
            style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11, flexShrink: 0 }}
            onClick={() => add(false)}
          >
            Add
          </button>
        )}
        {state === "adding" && (
          <span className="mut" style={{ fontSize: 11, flexShrink: 0 }}>
            Adding…
          </span>
        )}
      </div>

      {duplicate && (
        <div className="duplicate-notice gz-up">
          <p style={{ fontSize: 12, lineHeight: 1.6 }}>
            {duplicate.title && duplicate.artist
              ? `"${duplicate.title}" by ${duplicate.artist} is already in for this drop.`
              : "This is already in for this drop."}{" "}
            Still want to add it?
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5 }}
              onClick={() => add(true)}
            >
              Add it anyway
            </button>
            <button type="button" className="link-btn" onClick={() => setDuplicate(null)}>
              Never mind
            </button>
          </div>
        </div>
      )}

      {state === "error" && error && (
        <p className="notice error" style={{ marginTop: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** The original paste-a-link flow, unchanged — now only reachable as
 * AddPick's fallback for whenever this club's Spotify connection isn't
 * available (no token yet, or it's been revoked). Posts to the same
 * /api/room/picks route it always has. */
function ManualAddPick({ onAdded }: { onAdded: () => void }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakeGen, setShakeGen] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);

  async function submit(force: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/room/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link, force }),
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
      setLink("");
      setDuplicate(null);
      onAdded();
    } catch {
      setError("Something went wrong. Try again.");
      setShakeGen((g) => g + 1);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim() || !isValidMusicLink(link)) {
      setError(LINK_ERROR);
      setShakeGen((g) => g + 1);
      return;
    }
    await submit(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className="mut" style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 10 }}>
        Spotify search isn&rsquo;t available right now — add your pick by hand instead.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          type="url"
          className="settings-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Paste a Spotify or Apple Music link…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(null);
            setDuplicate(null);
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "auto" }}>
          {submitting ? "Adding…" : "Add"}
        </button>
      </div>
      {error && (
        <p key={`pick-${shakeGen}`} className="notice error gz-shake" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
      {duplicate && (
        <div className="duplicate-notice gz-up" style={{ marginTop: 8 }}>
          <p style={{ fontSize: 12, lineHeight: 1.6 }}>
            {duplicate.title && duplicate.artist
              ? `"${duplicate.title}" by ${duplicate.artist} is already in for this drop.`
              : "This link is already in for this drop."}{" "}
            Still want to add it?
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5 }}
              disabled={submitting}
              onClick={() => submit(true)}
            >
              {submitting ? "Adding…" : "Add it anyway"}
            </button>
            <button type="button" className="link-btn" onClick={() => setDuplicate(null)}>
              Never mind
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function PicksCard({ picks, onRemoved }: { picks: Pick[]; onRemoved: () => void }) {
  return (
    <div className="ct-card" style={{ marginTop: 20 }}>
      <p className="label" style={{ marginBottom: 10 }}>
        This cycle&rsquo;s picks ({picks.length})
      </p>
      {picks.length === 0 ? (
        <div className="empty-state" style={{ padding: "12px 0" }}>
          No picks yet — search above to add one.
        </div>
      ) : (
        <div className="pile-list">
          {picks.map((p) => (
            <PickRow key={p.id} pick={p} onRemoved={onRemoved} />
          ))}
        </div>
      )}
    </div>
  );
}

function PickRow({ pick, onRemoved }: { pick: Pick; onRemoved: () => void }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/room/picks/${pick.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't remove that. Try again.");
        return;
      }
      onRemoved();
    } catch {
      setError("Couldn't remove that. Try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="pile-row">
      <div className="pile-info" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {pick.artworkUrl ? (
          <FallbackImg
            src={pick.artworkUrl}
            className="track-row-art"
            fallbackClassName="track-row-art track-row-art-empty"
          />
        ) : (
          <div className="track-row-art track-row-art-empty" aria-hidden="true" />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="track-title">{pick.title}</div>
          <div className="track-artist">{pick.artist}</div>
          {pick.curatorCredit && <div className="pile-meta">picked by {pick.curatorCredit}</div>}
        </div>
      </div>
      <div className="pile-action">
        <button type="button" className="link-btn" onClick={remove} disabled={removing}>
          {removing ? "Removing…" : "Remove"}
        </button>
        {error && (
          <p className="notice error" style={{ marginTop: 6, maxWidth: 160 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function PileCard({
  pile,
  hasOpenDrop,
  onAdded,
}: {
  pile: PileItem[];
  hasOpenDrop: boolean;
  onAdded: () => void;
}) {
  return (
    <div className="ct-card" style={{ marginTop: 20 }}>
      <p className="label" style={{ marginBottom: 10 }}>
        Submission pile ({pile.length})
      </p>
      {pile.length === 0 ? (
        <div className="empty-state" style={{ padding: "12px 0" }}>
          Nothing submitted for this drop yet.
        </div>
      ) : (
        <div className="pile-list">
          {pile.map((item) => (
            <PileRow key={item.id} item={item} hasOpenDrop={hasOpenDrop} onAdded={onAdded} />
          ))}
        </div>
      )}
    </div>
  );
}

function PileRow({
  item,
  hasOpenDrop,
  onAdded,
}: {
  item: PileItem;
  hasOpenDrop: boolean;
  onAdded: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadyAdded = !!item.pulledAt;

  async function quickAdd() {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      onAdded();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="pile-row">
      <div className="pile-info" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {item.artworkUrl ? (
          <FallbackImg
            src={item.artworkUrl}
            className="track-row-art"
            fallbackClassName="track-row-art track-row-art-empty"
          />
        ) : (
          <div className="track-row-art track-row-art-empty" aria-hidden="true" />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="track-title">{item.title && item.artist ? item.title : item.link}</div>
          {item.title && item.artist && <div className="track-artist">{item.artist}</div>}
          <div className="pile-meta">
            {item.submittedBy ?? "—"} · {formatRelativeTime(new Date(item.submittedAt))}
          </div>
        </div>
      </div>
      <div className="pile-action">
        {alreadyAdded ? (
          <span className="pile-added">Added ✓</span>
        ) : (
          <button
            type="button"
            className="btn"
            style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5 }}
            onClick={quickAdd}
            disabled={adding || !hasOpenDrop}
            title={!hasOpenDrop ? "No drop in progress right now" : undefined}
          >
            {adding ? "Adding…" : "Quick-add"}
          </button>
        )}
        {error && (
          <p className="notice error" style={{ marginTop: 6, maxWidth: 160 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function CuratorsDisclosure({ roster }: { roster: RosterCurator[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ct-card" style={{ marginTop: 20 }}>
      <button type="button" className="ct-disclosure" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="label" style={{ marginBottom: 0 }}>
          Curators ({roster.length})
        </span>
        <span className="mut" style={{ fontSize: 11 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="roster-list" style={{ marginTop: 12 }}>
          {roster.map((c) => (
            <div key={c.id} className="roster-row">
              <span className="roster-name">{c.name}</span>
              <span className="roster-meta">
                {c.picksThisCycle} this cycle · {c.picksLifetime} lifetime · joined{" "}
                {joinedLabel(c.joinedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Top10Disclosure({ top10 }: { top10: Top10CardProps }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ct-card" style={{ marginTop: 20 }}>
      <button type="button" className="ct-disclosure" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="label" style={{ marginBottom: 0 }}>
          Subscriber Top 10
        </span>
        <span className="mut" style={{ fontSize: 11 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <Top10Card {...top10} />
        </div>
      )}
    </div>
  );
}
