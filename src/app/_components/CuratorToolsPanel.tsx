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

/** Everything the Manage-this-drop panel needs, including the short
 * "who did what" history line(s) (2026-10-08 "drop control" round —
 * see claude/next-build.md: the founder's own "lightweight... but not
 * necessary" call, so this stays one or two short lines, not a real
 * audit log). Dates arrive as ISO strings — serialized server-side in
 * src/app/account/page.tsx, same convention as every other date this
 * panel already receives (pile/roster/etc). */
type ShipCandidate = {
  dropId: number;
  dropNum: number;
  title: string | null;
  pickCount: number;
  startedBy: string | null;
  startedAt: string;
  titleUpdatedBy: string | null;
  titleUpdatedAt: string | null;
  scheduledShipAt: string | null;
};

/** A drop a curator canceled that's still eligible to be un-canceled
 * (src/lib/overview.ts's own CanceledDrop — see that type's comment
 * for the exact eligibility rule). */
type CanceledDrop = {
  num: number;
  title: string | null;
  canceledBy: string | null;
  canceledAt: string;
};

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
  /** Curator-scheduled auto-open date for the next drop — only ever
   * meaningful (and only ever shown) while nothing's open right now. */
  nextDropOpensAt: string | null;
  canceledDrop: CanceledDrop | null;
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
  nextDropOpensAt,
  canceledDrop,
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

      {!hasOpenDrop && canceledDrop && <CanceledDropBanner canceledDrop={canceledDrop} onChanged={refresh} />}

      {!hasOpenDrop && (
        <StartDropCard dropNum={dropNum} nextDropOpensAt={nextDropOpensAt} onChanged={refresh} />
      )}

      {hasOpenDrop && (
        <>
          <AddPick onAdded={refresh} />
          <PicksCard picks={picks} onRemoved={refresh} />
        </>
      )}

      <PileCard pile={pile} hasOpenDrop={hasOpenDrop} onAdded={refresh} />

      <CuratorsDisclosure roster={roster} />

      {shipCandidate && <ManageDropCard shipCandidate={shipCandidate} onChanged={refresh} />}

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

function StartDropCard({
  dropNum,
  nextDropOpensAt,
  onChanged,
}: {
  dropNum: number;
  nextDropOpensAt: string | null;
  onChanged: () => void;
}) {
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
      onChanged();
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

      <hr className="hairline" style={{ margin: "16px 0" }} />
      <ScheduleOpenField nextDropOpensAt={nextDropOpensAt} onChanged={onChanged} />
    </div>
  );
}

/** Set a date for drop {dropNum} to open itself, no click needed
 * (2026-10-08 "drop control" round — the founder's own ask: "pick
 * actual dates and it s[h]ips automatically" for both ends of a drop,
 * not just shipping). Stored on the club (src/db/schema.ts's
 * clubs.nextDropOpensAt), since the drop itself doesn't exist until
 * the daily cron (src/app/api/cron/drops) actually starts it — once a
 * day, same precision as auto-ship, per the founder's own "thats
 * fine." */
function ScheduleOpenField({
  nextDropOpensAt,
  onChanged,
}: {
  nextDropOpensAt: string | null;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(nextDropOpensAt ? toDatetimeLocalValue(nextDropOpensAt) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/schedule-open", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextDropOpensAt: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that. Try again.");
        return;
      }
      onChanged();
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="mut" style={{ fontSize: 11.5 }}>
        {nextDropOpensAt
          ? "Scheduled to open automatically — checked once a day:"
          : "Or schedule it to open itself later (optional):"}
      </span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          type="datetime-local"
          className="settings-input"
          style={{ flex: 1, minWidth: 180 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
          disabled={saving || !value}
          onClick={() => save(new Date(value).toISOString())}
        >
          {saving ? "Saving…" : "Schedule"}
        </button>
        {nextDropOpensAt && (
          <button
            type="button"
            className="link-btn"
            disabled={saving}
            onClick={() => {
              setValue("");
              save(null);
            }}
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="notice error">{error}</p>}
    </div>
  );
}

/** A canceled drop that's still eligible to be un-canceled, shown only
 * to curators (2026-10-08 "drop control" round — founder's explicit
 * "curator-only visibility" + "can be uncancelled" calls). Nothing
 * was ever deleted on cancel, so this is just flipping canceledAt back
 * off — src/app/api/overview/uncancel enforces the same "still the
 * true latest drop" guard this banner's own visibility already implies. */
function CanceledDropBanner({
  canceledDrop,
  onChanged,
}: {
  canceledDrop: { num: number; title: string | null; canceledBy: string | null; canceledAt: string };
  onChanged: () => void;
}) {
  const [uncanceling, setUncanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uncancel() {
    setUncanceling(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/uncancel", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't un-cancel that. Try again.");
        return;
      }
      onChanged();
    } catch {
      setError("Couldn't un-cancel that. Try again.");
    } finally {
      setUncanceling(false);
    }
  }

  return (
    <div className="ct-card gz-up" style={{ marginTop: 20 }}>
      <p className="label" style={{ marginBottom: 6 }}>
        Drop {canceledDrop.num} was canceled
      </p>
      <p className="mut" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
        {canceledDrop.title ? `"${canceledDrop.title}"` : `Drop ${canceledDrop.num}`}
        {canceledDrop.canceledBy && <> · canceled by {canceledDrop.canceledBy}</>} · its picks are
        still there, nothing was lost.
      </p>
      <button
        type="button"
        className="btn"
        style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5 }}
        disabled={uncanceling}
        onClick={uncancel}
      >
        {uncanceling ? "Un-canceling…" : `Un-cancel drop ${canceledDrop.num}`}
      </button>
      {error && (
        <p className="notice error" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` in the
 * viewer's own local time, not an ISO string — this just reformats
 * one into the other for the field's initial value. */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Manage-this-drop (2026-10-08 "drop control" round — see
 * claude/next-build.md). Replaces the old bare "Ship drop N" card:
 * the founder's own call was that Ship should fold into a bigger panel
 * rather than sit beside it ("replace and be apart of... add to it").
 * Rename works anytime while the drop's open (any current curator can
 * do it — there's no single owner), the schedule-ship date is the
 * other half of "pick actual dates and it ships automatically," and
 * Cancel is reversible with curator-only visibility — see
 * CanceledDropBanner above for the un-cancel side of that.
 */
function ManageDropCard({ shipCandidate, onChanged }: { shipCandidate: ShipCandidate; onChanged: () => void }) {
  const { dropId, dropNum, title, pickCount, startedBy, titleUpdatedBy, scheduledShipAt } = shipCandidate;

  return (
    <div className="ct-card-emphasis gz-up" style={{ marginTop: 20 }} key={dropId}>
      <p className="label" style={{ marginBottom: 10 }}>
        Manage drop {dropNum}
      </p>

      <RenameDropField
        dropNum={dropNum}
        title={title}
        startedBy={startedBy}
        titleUpdatedBy={titleUpdatedBy}
        onChanged={onChanged}
      />

      <hr className="hairline" style={{ margin: "16px 0" }} />

      <ScheduleShipField scheduledShipAt={scheduledShipAt} onChanged={onChanged} />

      <hr className="hairline" style={{ margin: "16px 0" }} />

      <ShipDropCard dropNum={dropNum} pickCount={pickCount} />

      <hr className="hairline" style={{ margin: "16px 0" }} />

      <CancelDropControl dropNum={dropNum} onChanged={onChanged} />
    </div>
  );
}

/** Any current curator can rename an open drop, any time before it
 * ships (founder's own answers: "whoever is a curator during the time
 * of the drop can rename it," "just before the drop, cant change
 * after" — the field living only inside the open-drop Manage panel is
 * what enforces the latter; there's nothing to lock separately). */
function RenameDropField({
  dropNum,
  title,
  startedBy,
  titleUpdatedBy,
  onChanged,
}: {
  dropNum: number;
  title: string | null;
  startedBy: string | null;
  titleUpdatedBy: string | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title ?? `Drop ${dropNum}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/rename", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value.trim() || `Drop ${dropNum}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't rename that. Try again.");
        return;
      }
      setEditing(false);
      onChanged();
    } catch {
      setError("Couldn't rename that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // "last edited by" line — titleUpdatedBy wins once it's ever been
  // set (that's the more recent fact); startedBy otherwise. Lightweight
  // on purpose (founder's own call) — just who, no timestamp.
  const historyLine = titleUpdatedBy
    ? `renamed by ${titleUpdatedBy}`
    : startedBy
      ? `started by ${startedBy}`
      : null;

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <p className="label" style={{ marginBottom: 2 }}>
            {title ?? `Drop ${dropNum}`}
          </p>
          {historyLine && (
            <p className="mut" style={{ fontSize: 10.5 }}>
              {historyLine}
            </p>
          )}
        </div>
        <button
          type="button"
          className="link-btn"
          style={{ flexShrink: 0 }}
          onClick={() => {
            setValue(title ?? `Drop ${dropNum}`);
            setError(null);
            setEditing(true);
          }}
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="text"
        className="settings-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Drop ${dropNum}`}
      />
      {error && <p className="notice error">{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          className="btn"
          style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5 }}
          disabled={saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="link-btn" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The other half of "pick actual dates and it ships automatically" —
 * the daily cron (src/app/api/cron/drops) ships this drop, same
 * auto-build-then-send path as a manual Ship click, once this date
 * passes. Once-a-day precision, not exact-minute — the founder's own
 * "thats fine" on that trade-off. */
function ScheduleShipField({
  scheduledShipAt,
  onChanged,
}: {
  scheduledShipAt: string | null;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(scheduledShipAt ? toDatetimeLocalValue(scheduledShipAt) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/schedule-ship", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledShipAt: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that. Try again.");
        return;
      }
      onChanged();
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="mut" style={{ fontSize: 11.5 }}>
        {scheduledShipAt
          ? "Ships automatically — checked once a day:"
          : "Auto-ship date (optional — otherwise ship manually below):"}
      </span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          type="datetime-local"
          className="settings-input"
          style={{ flex: 1, minWidth: 180 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
          disabled={saving || !value}
          onClick={() => save(new Date(value).toISOString())}
        >
          {saving ? "Saving…" : "Set"}
        </button>
        {scheduledShipAt && (
          <button
            type="button"
            className="link-btn"
            disabled={saving}
            onClick={() => {
              setValue("");
              save(null);
            }}
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="notice error">{error}</p>}
    </div>
  );
}

/** Reversible — nothing's deleted, curator-only visibility, the drop
 * number stays used up either way (founder's own calls: "wouldnt want
 * it to lose all the data... closed off for curators eyes only" /
 * "can be uncancelled"). The un-cancel side lives in
 * CanceledDropBanner above, shown instead of this once nothing's open. */
function CancelDropControl({ dropNum, onChanged }: { dropNum: number; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setCanceling(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/cancel", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't cancel that. Try again.");
        return;
      }
      onChanged();
    } catch {
      setError("Couldn't cancel that. Try again.");
    } finally {
      setCanceling(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="link-btn" style={{ color: "var(--err)" }} onClick={() => setConfirming(true)}>
        Cancel drop {dropNum}
      </button>
    );
  }

  return (
    <div className="duplicate-notice gz-up">
      <p style={{ fontSize: 12, lineHeight: 1.6 }}>
        Cancel drop {dropNum}? Nothing&rsquo;s deleted — its picks stay put and a curator can
        un-cancel it later. It just closes off from here on, and the drop number stays used up.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button
          type="button"
          className="btn"
          style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5 }}
          disabled={canceling}
          onClick={cancel}
        >
          {canceling ? "Canceling…" : "Yes, cancel it"}
        </button>
        <button type="button" className="link-btn" disabled={canceling} onClick={() => setConfirming(false)}>
          Never mind
        </button>
      </div>
      {error && (
        <p className="notice error" style={{ marginTop: 8 }}>
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
        <p className="mut" style={{ fontSize: 11.5, marginTop: 10 }}>
          Spotify search isn&rsquo;t available right now — paste a link instead, below.
        </p>
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

      {/* Always visible now, not just an automatic fallback (2026-10-08
          "drop control" round — founder's own ask: his actual curators
          mostly paste Apple Music links, so that path needs to be
          right there next to the search, not hidden until Spotify
          happens to be unavailable — see claude/next-build.md). */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--ln)" }}>
        <p className="mut" style={{ fontSize: 11, marginBottom: 10 }}>
          Or paste a Spotify/Apple Music link directly:
        </p>
        <ManualAddPick onAdded={handleAdded} />
      </div>
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

/** The original paste-a-link flow — always visible now, next to the
 * search box, not just a fallback for when Spotify search is down
 * (2026-10-08 "drop control" round — see claude/next-build.md). Posts
 * to the same /api/room/picks route it always has. */
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
