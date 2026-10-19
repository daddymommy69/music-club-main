"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatRelativeTime } from "@/lib/relativeTime";
import { siteCopy, splitParagraphs } from "@/lib/copy";
import FallbackImg from "./FallbackImg";
import ShipDropCard from "./ShipDropCard";
import Top10Card, { type Top10CardProps } from "./Top10Card";
import RoleName from "./RoleName";

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

/** A shipped drop with no Spotify playlist yet — see
 * src/lib/archive.ts's getDropsMissingPlaylist for how this list is
 * built. */
type MissingPlaylistDrop = {
  num: number;
  title: string | null;
};

/** Every shipped drop, for the cover-download list below (2026-10-18 —
 * founder's own ask: "a place in curator where i can automatically
 * download the covers created from the drops"). Same shape as
 * MissingPlaylistDrop (num + title) but a different list — this is
 * every published drop, not just the ones missing a Spotify playlist. */
type PublishedDropSummary = {
  num: number;
  title: string | null;
};

/** One post in a curator's blurb feed — about the drop, or about a
 * single song, depending on which list it's in (2026-10-16 "feed of
 * posts" redesign — see BlurbFeed below). A curator can have more than
 * one of these per drop/song now; `mine` is computed server-side
 * (src/app/account/page.tsx) from the viewer's own member id so the
 * feed can show Edit/Delete only on the viewer's own posts, without
 * the client needing to know its own id for anything else. `createdAt`
 * is the post's fixed moment; `updatedAt` moves on edit — the feed
 * shows "edited" whenever the two meaningfully differ. */
type Note = {
  id: number;
  curatorId: number;
  curatorName: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
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
  dropsMissingPlaylist: MissingPlaylistDrop[];
  /** The open drop's own "about this drop" blurbs, one per curator who's
   * written one (2026-10-16). Empty whenever there's no open drop. */
  dropNotes: Note[];
  /** Per-song blurbs for the open drop, keyed by song id (2026-10-16).
   * A song with no blurbs yet just has no entry here. */
  songNotes: Record<number, Note[]>;
  /** Every shipped drop, oldest or newest first doesn't matter here —
   * DropCoversDisclosure sorts its own way. Powers the cover-download
   * list (2026-10-18). */
  publishedDrops: PublishedDropSummary[];
};

type DuplicateInfo = { title: string | null; artist: string | null };

/**
 * 2026-10-13 bug fix (see claude/next-build.md "site clarity" round —
 * the founder's own report: "the date isnt being linked with the set
 * date for the drop"). Previously checked `isManual` FIRST and
 * returned "no scheduled date" unconditionally whenever the club's
 * overall cycle setting is manual — even when `daysUntilNext` held a
 * real value, because a curator had set this specific drop's ship
 * date in Manage Drop (ScheduleShipField -> scheduledShipAt).
 * getDropStatus() (src/lib/dropStatus.ts) already computes
 * daysUntilNext from scheduledShipAt regardless of isManual, so the
 * bug was purely here: isManual only means "no automatic cycle
 * countdown," not "no date was manually set." Now `daysUntilNext`
 * wins whenever it's present, whichever way it got set; `isManual`
 * only picks which fallback message to show when there's truly
 * nothing to count down to.
 */
function timeLabel(isManual: boolean, daysUntilNext: number | null) {
  if (daysUntilNext !== null) {
    if (daysUntilNext === 0) return "shipping today";
    return `${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"}`;
  }
  return isManual ? "no scheduled date" : "timing unknown";
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
  dropsMissingPlaylist,
  dropNotes,
  songNotes,
  publishedDrops,
}: CuratorToolsPanelProps) {
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  return (
    <div className="gz-up">
      <CuratorHelpDisclosure />

      {/* Only way to reach /settings anywhere in the app (2026-10-09 round
          2 — the founder's own report: there was no link to it at all,
          not a missing-access-level bug, just a missing link). Same
          curator gating as /settings itself — any curator can see the
          club-wide name/cycle settings there; the curator-grant panel
          inside it is further gated to admins only, same as before. */}
      <div style={{ textAlign: "right", marginBottom: 10 }}>
        <Link href="/settings" className="mut" style={{ fontSize: 11.5 }}>
          Settings →
        </Link>
      </div>

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

      {/* Manage drop N moved to the top of the open-drop view (2026-10-16
          — founder's own ask: "bring the drop manager to the top instead
          of the bottom," "above the add a pick area"). Rename now lives
          inside it too — see ManageDropCard's own comment. */}
      {shipCandidate && <ManageDropCard shipCandidate={shipCandidate} onChanged={refresh} />}

      {hasOpenDrop && (
        <>
          <AddPick onAdded={refresh} />
          <DropBlurbCard dropNotes={dropNotes} onChanged={refresh} />
          <PicksCard picks={picks} songNotes={songNotes} onRemoved={refresh} onChanged={refresh} />
        </>
      )}

      <PileCard pile={pile} hasOpenDrop={hasOpenDrop} onAdded={refresh} />

      {dropsMissingPlaylist.length > 0 && (
        <MissingPlaylistCard drops={dropsMissingPlaylist} onBuilt={refresh} />
      )}

      <CuratorsDisclosure roster={roster} />

      {top10 && <Top10Disclosure top10={top10} />}

      {publishedDrops.length > 0 && <DropCoversDisclosure drops={publishedDrops} />}
    </div>
  );
}

/**
 * 2026-10-13 — founder's own ask (see claude/next-build.md's "site
 * clarity" round), pinned at the top of the panel ("top of curator
 * tools board") rather than as a formal titled section — just "help,"
 * collapsed by default, same spirit as Curators/Top 10 below. Written
 * in the same casual voice as the About page copy. Covers the two
 * things that actually aren't obvious from using the tools: the
 * Spotify auto-build's silent dependency on Settings' connection (the
 * founder's own mix-up this round — it does NOT build "no matter
 * what"), and that scheduling exists at all. Deliberately skips the
 * pick-vs-submission mechanic — Submission pile already has its own
 * always-visible line for that, and the founder's own call was that
 * the two are "essentially the same thing" to explain twice.
 */
function CuratorHelpDisclosure() {
  const [open, setOpen] = useState(false);
  const paragraphs = splitParagraphs(siteCopy.curatorHelpText);
  return (
    <div className="ct-card" style={{ marginBottom: 20 }}>
      <button type="button" className="ct-disclosure" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="label" style={{ marginBottom: 0 }}>
          help
        </span>
        <span className="mut" style={{ fontSize: 11 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <p className="mut" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
          {paragraphs.map((para, i) => (
            <span key={i}>
              {para}
              {i < paragraphs.length - 1 && (
                <>
                  <br />
                  <br />
                </>
              )}
            </span>
          ))}
        </p>
      )}
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
 * Ship/Cancel are a matched pair inside ShipDropCard now — see that
 * file's own comment. CanceledDropBanner (above) is the un-cancel
 * side, shown instead of this once nothing's open.
 *
 * Moved to the top of the open-drop view, and Rename moved back in
 * here (2026-10-16 revamp — founder's own ask: "bring the drop manager
 * to the top instead of the bottom," and rename "should be in the
 * manage drop 2 section honestly" — it had briefly lived in the
 * drop-blurb area instead, which he found hard to find).
 */
function ManageDropCard({ shipCandidate, onChanged }: { shipCandidate: ShipCandidate; onChanged: () => void }) {
  const { dropId, dropNum, title, startedBy, titleUpdatedBy, pickCount, scheduledShipAt } = shipCandidate;

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

      <ShipDropCard dropNum={dropNum} pickCount={pickCount} onChanged={onChanged} />
    </div>
  );
}

/** Any current curator can rename an open drop, any time before it
 * ships (founder's own answers: "whoever is a curator during the time
 * of the drop can rename it," "just before the drop, cant change
 * after" — the field living only inside Manage drop N (which only
 * ever renders for the open drop) is what enforces the latter; there's
 * nothing to lock separately). Briefly lived in the drop-blurb area
 * instead (2026-10-16's first pass) — moved back here the same round
 * once the founder found it hard to locate there: "that should be in
 * the manage drop 2 section honestly." */
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
          className="btn"
          style={{ width: "auto", flexShrink: 0, minHeight: 32, height: 32, padding: "0 14px", fontSize: 11.5 }}
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

/**
 * "About this drop" (2026-10-16 revamp — founder's own ask). Used to
 * also hold rename and a repeated "Song blurbs" list; both moved out
 * this round — rename now lives in Manage drop N (the founder's own
 * "that should be in the manage drop 2 section honestly"), and the
 * per-song blurbs are meshed directly into each pick's own row in
 * PicksCard below ("i want them to be meshed, where you write the
 * notes under the song") instead of repeating the whole picks list a
 * second time here. This card is now just the one drop-level blurb,
 * kept above the picks list per the founder's own "keep that above
 * all the songs." The placeholder's loosened, journal-style wording is
 * also his own ask, now matched by each song blurb's placeholder in
 * PicksCard. Reuses curatorNotes, which already had public display
 * built (DropDetail.tsx) — this is only the write side — and also goes
 * out in the release email (src/lib/messages.ts's releaseEmailHtml).
 */
function DropBlurbCard({ dropNotes, onChanged }: { dropNotes: Note[]; onChanged: () => void }) {
  return (
    <div className="ct-card" style={{ marginTop: 20 }}>
      <p className="label" style={{ marginBottom: 8 }}>
        About this drop
      </p>
      <BlurbFeed
        notes={dropNotes}
        placeholder={siteCopy.dropBlurbPlaceholder}
        onCreate={async (text) => {
          const res = await fetch("/api/overview/drop-note", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Couldn't post that. Try again.");
        }}
        onUpdate={async (id, text) => {
          const res = await fetch(`/api/overview/drop-note/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Couldn't save that. Try again.");
        }}
        onDelete={async (id) => {
          const res = await fetch(`/api/overview/drop-note/${id}`, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Couldn't delete that. Try again.");
        }}
        onChanged={onChanged}
      />
    </div>
  );
}

/** A textarea that grows to fit whatever's typed instead of starting
 * short and needing a manual drag (2026-10-16 — founder's own ask: "can
 * [the blurb box] autofill size to make sure you can read all the
 * writing when writing?"). Resizes on every value change (including the
 * very first render, so a box pre-filled with a long post opens already
 * tall) by measuring scrollHeight — the standard height:auto-then-
 * scrollHeight trick, since there's no CSS-only way to size a textarea
 * to its content. Manual dragging (`resize`) is turned off since
 * there's no longer anything for it to do that this doesn't already
 * handle. Shared by BlurbFeed's compose box and BlurbPost's inline
 * editor below. */
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="settings-input"
      style={{ resize: "none", overflow: "hidden", padding: "10px 12px", lineHeight: 1.6, minHeight: 60 }}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      // Opted out of the device's own text-replacement/autocorrect
      // engine (2026-10-16 — founder's report: typing repeated periods
      // quickly on iOS was swallowing characters after the 2nd one).
      // Every iOS browser runs on WebKit regardless of which app it is,
      // so this isn't Safari-specific — any iOS browser can trigger it.
      // These four attributes are the standard opt-out; they don't
      // change anything for anyone typing normally.
      autoCorrect="off"
      autoCapitalize="off"
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** A compose box plus the running feed of everyone's posts underneath,
 * oldest first (2026-10-16 "feed of posts" redesign — founder's own
 * ask, after the original one-ever-editable-draft-per-curator model
 * "didn't really feel like anything saved": every Post now appends a
 * brand-new, separately-timestamped entry instead of overwriting the
 * same draft forever, and the compose box clears right after so it's
 * obviously ready for the next thought. A curator can post as many as
 * they want per drop/song. Shared by the drop blurb and every song
 * blurb — only the placeholder and the three API calls differ, passed
 * in via props. Reuses the same .curator-notes/.curator-note classes
 * the public drop page's curator-notes block already uses. */
function BlurbFeed({
  notes,
  placeholder,
  onCreate,
  onUpdate,
  onDelete,
  onChanged,
}: {
  notes: Note[];
  placeholder: string;
  onCreate: (text: string) => Promise<void>;
  onUpdate: (id: number, text: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPosting(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setDraft("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that. Try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <AutoGrowTextarea value={draft} onChange={setDraft} placeholder={placeholder} disabled={posting} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <button
          type="button"
          className="btn"
          style={{ width: "auto", minHeight: 30, height: 30, padding: "0 12px", fontSize: 11.5 }}
          disabled={posting || !draft.trim()}
          onClick={post}
        >
          {posting ? "Posting…" : "Post"}
        </button>
        {error && <p className="notice error">{error}</p>}
      </div>
      {notes.length > 0 && (
        <div className="curator-notes gz-up" style={{ marginTop: 14, gap: 12 }}>
          {notes.map((n) => (
            <BlurbPost key={n.id} note={n} onUpdate={onUpdate} onDelete={onDelete} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One post in a BlurbFeed. Read-only (name + relative time + text) for
 * everyone else's; the viewer's own posts (`note.mine`) grow a small
 * Edit/Delete pair — Edit swaps the post in place for an auto-growing
 * textarea with Save/Cancel, same spirit as Rename's own inline-edit
 * pattern elsewhere in this file; Delete swaps to an are-you-sure
 * confirmation in place, same two-step pattern ShipDropCard's Cancel
 * already uses, since a post is enough work to write that an accidental
 * tap shouldn't be able to lose it. "edited" shows whenever a post's
 * updatedAt has actually moved past its createdAt by more than a
 * minute — small slop so the save that creates a post (createdAt and
 * updatedAt land within milliseconds of each other) never misreads as
 * an edit. */
function BlurbPost({
  note,
  onUpdate,
  onDelete,
  onChanged,
}: {
  note: Note;
  onUpdate: (id: number, text: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note.text);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edited = new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000;

  async function save() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(note.id, trimmed);
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(note.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that. Try again.");
      setDeleting(false);
    }
  }

  if (confirmingDelete) {
    return (
      <div className="curator-note">
        <p style={{ fontSize: 12, lineHeight: 1.6 }}>Delete this post? This can&rsquo;t be undone.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-danger"
            style={{ width: "auto", minHeight: 28, height: 28, padding: "0 12px", fontSize: 11.5 }}
            disabled={deleting}
            onClick={doDelete}
          >
            {deleting ? "Deleting…" : "Yes, delete it"}
          </button>
          <button
            type="button"
            className="link-btn"
            disabled={deleting}
            onClick={() => {
              setConfirmingDelete(false);
              setError(null);
            }}
          >
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

  if (editing) {
    return (
      <div className="curator-note">
        <AutoGrowTextarea value={value} onChange={setValue} disabled={saving} autoFocus />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <button
            type="button"
            className="btn"
            style={{ width: "auto", minHeight: 28, height: 28, padding: "0 12px", fontSize: 11.5 }}
            disabled={saving || !value.trim()}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="link-btn"
            disabled={saving}
            onClick={() => {
              setValue(note.text);
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </button>
          {error && <p className="notice error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="curator-note">
      <div className="curator-name">
        <RoleName name={note.curatorName} isCurator />
        <span className="mut" style={{ fontSize: 10.5, marginLeft: 6 }}>
          {formatRelativeTime(new Date(note.createdAt))}
          {edited ? " · edited" : ""}
        </span>
      </div>
      <div className="note-text">{note.text}</div>
      {note.mine && (
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button type="button" className="link-btn" style={{ fontSize: 11 }} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="link-btn"
            style={{ fontSize: 11, color: "var(--err)" }}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        </div>
      )}
      {error && (
        <p className="notice error" style={{ marginTop: 6 }}>
          {error}
        </p>
      )}
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

type SearchResult = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  externalUrl: string | null;
};

/** Live Spotify search, debounced as you type — same pattern as
 * Browse's search bar (src/app/_components/BrowseSearch.tsx).
 * Search-only now (2026-10-16 — founder's own ask, removing the old
 * "paste a link directly" fallback that used to sit right below this:
 * "we can remove that in this drop ship area"). Note this does mean a
 * curator has no way to add a song by hand anymore if Spotify search
 * itself is ever unavailable — flagged to the founder before making
 * this change, since an earlier round had deliberately made that paste
 * path always-visible for curators who mostly paste Apple Music links;
 * this round's explicit answer was still "yes, remove it." */
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
        placeholder={siteCopy.addPickSearchPlaceholder}
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
          Spotify search isn&rsquo;t available right now — try again in a bit.
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

/**
 * "This cycle's picks" + the per-song blurb boxes, meshed into one
 * list (2026-10-16 — founder's own ask: "i want them to be meshed,
 * where you write the notes under the song" — previously these were
 * two separate lists that each repeated every song). Each row is now
 * the song itself plus its blurb composer, always open underneath —
 * no collapsing disclosure, per his "always open" answer.
 */
function PicksCard({
  picks,
  songNotes,
  onRemoved,
  onChanged,
}: {
  picks: Pick[];
  songNotes: Record<number, Note[]>;
  onRemoved: () => void;
  onChanged: () => void;
}) {
  return (
    <div className="ct-card" style={{ marginTop: 20 }}>
      <p className="label" style={{ marginBottom: 10 }}>
        This cycle&rsquo;s picks ({picks.length})
      </p>
      {picks.length === 0 ? (
        <div className="empty-state" style={{ padding: "12px 0" }}>
          {siteCopy.emptyPicksText}
        </div>
      ) : (
        <div className="pile-list">
          {picks.map((p) => (
            <PickRow key={p.id} pick={p} notes={songNotes[p.id] ?? []} onRemoved={onRemoved} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function PickRow({
  pick,
  notes,
  onRemoved,
  onChanged,
}: {
  pick: Pick;
  notes: Note[];
  onRemoved: () => void;
  onChanged: () => void;
}) {
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
    <div className="pile-row-wrap">
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
      <BlurbFeed
        notes={notes}
        placeholder={siteCopy.songBlurbPlaceholder}
        onCreate={async (text) => {
          const res = await fetch("/api/overview/song-note", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ songId: pick.id, text }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Couldn't post that. Try again.");
        }}
        onUpdate={async (id, text) => {
          const res = await fetch(`/api/overview/song-note/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Couldn't save that. Try again.");
        }}
        onDelete={async (id) => {
          const res = await fetch(`/api/overview/song-note/${id}`, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Couldn't delete that. Try again.");
        }}
        onChanged={onChanged}
      />
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
      <p className="label" style={{ marginBottom: 6 }}>
        Submission pile ({pile.length})
      </p>
      {/* Always-visible, not an InfoTip (2026-10-13 "site clarity" round,
          see claude/next-build.md) — this is the one spot curators
          actually got stuck on, per the founder's own explanation
          screenshot, so it stays as a plain line rather than something
          hidden behind an icon someone has to find. */}
      <p className="mut" style={{ fontSize: 11, marginBottom: 10 }}>
        {siteCopy.pilePickHint}
      </p>
      {pile.length === 0 ? (
        <div className="empty-state" style={{ padding: "12px 0" }}>
          {siteCopy.emptyPileText}
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

/**
 * Only shows up at all when a shipped drop has no Spotify playlist yet
 * (2026-10-15 — founder's own ask: "build spotify playlist button in
 * curator since it will be resuable"). Normally that's just drop 1,
 * which shipped before the auto-build existed — once it's built, this
 * drop drops off the list (dropsMissingPlaylist comes from the server,
 * refreshed via onBuilt) and the whole card disappears once nothing's
 * left. Same build it does at ship time, just triggered manually here
 * instead of needing the old curl + ADMIN_SECRET backfill route.
 */
function MissingPlaylistCard({
  drops,
  onBuilt,
}: {
  drops: MissingPlaylistDrop[];
  onBuilt: () => void;
}) {
  return (
    <div className="ct-card gz-up" style={{ marginTop: 20 }}>
      <p className="label" style={{ marginBottom: 6 }}>
        Missing Spotify playlists
      </p>
      <p className="mut" style={{ fontSize: 11, marginBottom: 10 }}>
        These shipped without one — build it from the same picks, same as a normal ship.
      </p>
      <div className="roster-list">
        {drops.map((d) => (
          <BuildPlaylistRow key={d.num} drop={d} onBuilt={onBuilt} />
        ))}
      </div>
    </div>
  );
}

function BuildPlaylistRow({ drop, onBuilt }: { drop: MissingPlaylistDrop; onBuilt: () => void }) {
  const [state, setState] = useState<"idle" | "building" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    spotifyUrl: string;
    matchedCount: number;
    totalCount: number;
    unmatchedTitles: string[];
  } | null>(null);

  async function build() {
    setState("building");
    setError(null);
    try {
      const res = await fetch("/api/overview/build-playlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropNum: drop.num }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't build it. Try again.");
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
      onBuilt();
    } catch {
      setError("Couldn't build it. Try again.");
      setState("error");
    }
  }

  return (
    <div className="roster-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span className="roster-name">{drop.title ?? `Drop ${drop.num}`}</span>
        {state !== "done" && (
          <button
            type="button"
            className="btn"
            style={{ width: "auto", minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5, flexShrink: 0 }}
            onClick={build}
            disabled={state === "building"}
          >
            {state === "building" ? "Building…" : "Build Spotify playlist"}
          </button>
        )}
      </div>
      {state === "done" && result && (
        <p className="mut" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
          Done —{" "}
          <a href={result.spotifyUrl} target="_blank" rel="noreferrer">
            open it on Spotify ↗
          </a>{" "}
          · matched {result.matchedCount} of {result.totalCount} songs.
          {result.unmatchedTitles.length > 0 && (
            <>
              {" "}
              Couldn&rsquo;t find: {result.unmatchedTitles.join(", ")}.
            </>
          )}
        </p>
      )}
      {state === "error" && error && <p className="notice error">{error}</p>}
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

/**
 * One download link per shipped drop (2026-10-18 — founder's own ask:
 * "a place in curator where i can automatically download the covers
 * created from the drops," for making social posts). Reuses the exact
 * same cover /api/drops/[num]/cover already builds for the release
 * email and the auto-built Spotify playlist — no new image anywhere,
 * just a convenient link to the one that already exists. That route is
 * public/unauthenticated by design (so email clients can load the
 * <img>), but the link to it only ever shows up here, inside curator
 * tools — so in practice only a curator ever sees it, matching the
 * founder's own "only curators can download. since this is a tool for
 * me." The `download` attribute makes a same-origin click save the
 * file straight away instead of opening it in a new tab.
 */
function DropCoversDisclosure({ drops }: { drops: PublishedDropSummary[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ct-card" style={{ marginTop: 20 }}>
      <button type="button" className="ct-disclosure" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="label" style={{ marginBottom: 0 }}>
          Drop covers ({drops.length})
        </span>
        <span className="mut" style={{ fontSize: 11 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="roster-list" style={{ marginTop: 12 }}>
          {drops.map((d) => (
            <div key={d.num} className="roster-row">
              <span className="roster-name">
                Drop {d.num}
                {d.title ? ` — ${d.title}` : ""}
              </span>
              <a href={`/api/drops/${d.num}/cover`} download={`drop-${d.num}-cover.jpg`} className="link-btn">
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
