"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isValidMusicLink } from "@/lib/musicLink";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useDirtyField } from "@/lib/useDirtyField";
import ShipDropCard from "./ShipDropCard";
import Top10Card, { type Top10CardProps } from "./Top10Card";

/**
 * The curator workspace (formerly the standalone /room + /overview
 * pages), folded into a single collapsible section at the bottom of
 * /account (2026-10 "account consolidation" round — see
 * claude/next-build.md). Every control here is the same control that
 * used to live on those two pages, posting to the same API routes —
 * this component just relocates and re-chromes them (no wordmark, no
 * "private" badge, no separate CuratorNav/LogoutButton, since /account
 * already has its own). Collapsed by default so a curator who's just
 * here to check their own pick/rating/favorites isn't confronted with
 * the whole workspace every visit.
 */

type RoomPick = { id: number; title: string; artist: string; sourceUrl: string | null };

type RoomCurator = {
  id: number;
  name: string;
  picks: RoomPick[];
  note: string;
  lastActivity: string | null;
};

type RoomComment = {
  id: number;
  curatorId: number;
  curatorName: string;
  text: string;
  createdAt: string;
};

type RoomStreamItem =
  | { kind: "pick"; at: string; curatorName: string; title: string; artist: string }
  | { kind: "note"; at: string; curatorName: string; text: string };

type PileItem = {
  id: number;
  title: string | null;
  artist: string | null;
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
  pile: PileItem[];
  roster: RosterCurator[];
  meId: number;
  curators: RoomCurator[];
  comments: RoomComment[];
  stream: RoomStreamItem[];
  shipCandidate: ShipCandidate | null;
  top10: Top10CardProps | null;
};

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
  pile,
  roster,
  meId,
  curators,
  comments,
  stream,
  shipCandidate,
  top10,
}: CuratorToolsPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"columns" | "stream">("columns");
  const panelRef = useRef<HTMLDivElement>(null);

  function refresh() {
    router.refresh();
  }

  // Fixes the founder's "opens in different positions, closes weird"
  // report (2026-10-07 — see claude/next-build.md): toggling used to
  // just snap the content in/out with no animation and no regard for
  // where the panel ended up on screen afterward. Now both directions
  // anchor the scroll position back to this panel's own header, so
  // opening never leaves you staring at the wrong part of the page and
  // closing never strands you somewhere the now-shorter page doesn't
  // make sense from.
  function toggle() {
    setOpen((o) => !o);
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="acc-panel" style={{ marginBottom: 30 }} ref={panelRef}>
      <button
        type="button"
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
        aria-expanded={open}
      >
        <span className="label" style={{ marginBottom: 0 }}>
          Curator tools
        </span>
        <span className="mut" style={{ fontSize: 11 }}>
          {open ? "▲ collapse" : "▼ expand"}
        </span>
      </button>

      {open && (
        <div className="gz-up" style={{ marginTop: 18 }}>
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

              <div className="pill-tabs" role="tablist" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className={`pill-tab ${view === "columns" ? "active" : ""}`}
                  onClick={() => setView("columns")}
                  aria-pressed={view === "columns"}
                >
                  Columns
                </button>
                <button
                  type="button"
                  className={`pill-tab ${view === "stream" ? "active" : ""}`}
                  onClick={() => setView("stream")}
                  aria-pressed={view === "stream"}
                >
                  Stream
                </button>
              </div>

              {view === "columns" ? (
                <ColumnsView curators={curators} meId={meId} onChanged={refresh} />
              ) : (
                <StreamView stream={stream} />
              )}

              <CommentThread comments={comments} onPosted={refresh} />
            </>
          )}

          <p className="label" style={{ margin: "32px 0 14px" }}>
            Submission pile
          </p>
          {pile.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px 0" }}>
              Nothing submitted for this drop yet.
            </div>
          ) : (
            <div className="pile-list">
              {pile.map((item) => (
                <PileRow key={item.id} item={item} hasOpenDrop={hasOpenDrop} onAdded={refresh} />
              ))}
            </div>
          )}

          <p className="label" style={{ margin: "32px 0 14px" }}>
            Curators
          </p>
          <div className="roster-list">
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

          {shipCandidate && (
            <ShipDropCard
              dropNum={shipCandidate.dropNum}
              title={shipCandidate.title}
              pickCount={shipCandidate.pickCount}
            />
          )}

          {top10 && <Top10Card {...top10} />}
        </div>
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
    <form onSubmit={start} className="acc-panel gz-up" style={{ marginTop: 20, marginBottom: 8 }}>
      <p className="label" style={{ marginBottom: 10 }}>
        Start drop {dropNum}
      </p>
      <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>
        Nothing&rsquo;s open right now — the submission pile and quick-add below stay off until a
        drop exists to pick into.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input
          className="settings-input"
          style={{ flex: 1 }}
          placeholder="Title (optional, changeable later)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "auto", padding: "0 16px" }}
          disabled={starting}
        >
          {starting ? "Starting…" : `Start drop ${dropNum}`}
        </button>
      </div>
      {error && (
        <p className="notice error" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </form>
  );
}

type DuplicateInfo = { title: string | null; artist: string | null };

function AddPick({ onAdded }: { onAdded: () => void }) {
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
    <form onSubmit={handleSubmit} className="room-add-pick-wrap" noValidate style={{ marginTop: 20 }}>
      <div className="room-add-pick">
        <input
          type="url"
          placeholder="Paste a Spotify or Apple Music link to add a pick…"
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

function ColumnsView({
  curators,
  meId,
  onChanged,
}: {
  curators: RoomCurator[];
  meId: number;
  onChanged: () => void;
}) {
  return (
    <div className="room-columns">
      {curators.map((c) => (
        <div key={c.id} className="room-column">
          <div className="room-column-head">
            <span className="room-column-name">{c.name}</span>
            <span className="room-column-meta">
              {String(c.picks.length).padStart(2, "0")}
              {c.lastActivity ? ` · ${formatRelativeTime(new Date(c.lastActivity))}` : ""}
            </span>
          </div>

          <div className="room-picks">
            {c.picks.length === 0 ? (
              <p className="mut" style={{ fontSize: 11.5 }}>
                No picks yet.
              </p>
            ) : (
              c.picks.map((p) => (
                <div key={p.id} className="room-pick">
                  <div className="track-title">{p.title}</div>
                  <div className="track-artist">{p.artist}</div>
                </div>
              ))
            )}
          </div>

          <div className="room-note">
            {c.id === meId ? (
              <NoteEditor initialText={c.note} onSaved={onChanged} />
            ) : c.note.trim() ? (
              <p className="note-text">{c.note}</p>
            ) : (
              <p className="mut" style={{ fontSize: 11.5 }}>
                No note yet.
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function NoteEditor({ initialText, onSaved }: { initialText: string; onSaved: () => void }) {
  const { value: text, setValue: setText, setSaved, dirty } = useDirtyField(initialText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/room/note", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save your note. Try again.");
        return;
      }
      setSaved(text);
      onSaved();
    } catch {
      setError("Couldn't save your note. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        aria-label="Your note for this drop"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder="Your note for this drop…"
      />
      {error && (
        <p className="notice error" style={{ marginTop: 6, fontSize: 11.5 }}>
          {error}
        </p>
      )}
      {dirty && (
        <button
          type="button"
          className="btn"
          style={{ marginTop: 8, minHeight: 32, height: 32, padding: "0 12px", fontSize: 11.5 }}
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      )}
    </div>
  );
}

function StreamView({ stream }: { stream: RoomStreamItem[] }) {
  if (stream.length === 0) {
    return <div className="empty-state">Nothing here yet — add a pick to get started.</div>;
  }
  return (
    <div className="room-stream">
      {stream.map((item, i) => (
        <div key={i} className="room-stream-item">
          <div className="room-stream-who">
            {item.curatorName} · {formatRelativeTime(new Date(item.at))}
          </div>
          {item.kind === "pick" ? (
            <div>
              <div className="track-title">{item.title}</div>
              <div className="track-artist">{item.artist}</div>
            </div>
          ) : (
            <p className="note-text">{item.text}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function CommentThread({ comments, onPosted }: { comments: RoomComment[]; onPosted: () => void }) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/room/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setText("");
      onPosted();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="comment-thread">
      <p className="label" style={{ marginBottom: 14 }}>
        Comments
      </p>
      {comments.length > 0 && (
        <div className="comment-list">
          {comments.map((c) => (
            <div key={c.id} className="comment-row">
              <div className="comment-head">
                <span className="who">{c.curatorName}</span>
                <span>{formatRelativeTime(new Date(c.createdAt))}</span>
              </div>
              <p className="comment-text">{c.text}</p>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="comment-form" noValidate>
        <textarea
          aria-label="Comment to the other curators"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something to the other curators…"
        />
        <button type="submit" className="btn" style={{ width: "auto" }} disabled={posting}>
          {posting ? "Posting…" : "Post"}
        </button>
      </form>
      {error && (
        <p className="notice error" style={{ marginTop: 8 }}>
          {error}
        </p>
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
      <div className="pile-info">
        <div className="track-title">{item.title && item.artist ? item.title : item.link}</div>
        {item.title && item.artist && <div className="track-artist">{item.artist}</div>}
        <div className="pile-meta">
          {item.submittedBy ?? "—"} · {formatRelativeTime(new Date(item.submittedAt))}
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
