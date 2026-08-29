"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isValidMusicLink } from "@/lib/musicLink";
import { formatRelativeTime } from "@/lib/relativeTime";
import LogoutButton from "./LogoutButton";

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

type RoomBoardProps = {
  clubName: string;
  dropNum: number;
  isManual: boolean;
  daysUntilNext: number | null;
  meId: number;
  meName: string;
  curators: RoomCurator[];
  comments: RoomComment[];
  stream: RoomStreamItem[];
};

const LINK_ERROR = "That link doesn't look right — try pasting it again.";

export default function RoomBoard({
  clubName,
  dropNum,
  isManual,
  daysUntilNext,
  meId,
  curators,
  comments,
  stream,
}: RoomBoardProps) {
  const router = useRouter();
  const [view, setView] = useState<"columns" | "stream">("columns");

  return (
    <>
      <div className="room-header gz-up">
        <div className="top-row">
          <span className="wordmark">{clubName}</span>
          <span className="room-phase">private</span>
        </div>
        <p className="room-time">
          Drop {dropNum}
          {" · "}
          {isManual
            ? "no scheduled date"
            : daysUntilNext === null
            ? "timing unknown"
            : daysUntilNext === 0
            ? "shipping today"
            : `${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"} until it ships`}
        </p>
        <p className="room-blurb">
          Locked to the three of you. When the drop goes out, the floor opens to everyone for a
          week.
        </p>
      </div>

      <AddPick onAdded={() => router.refresh()} />

      <div className="pill-tabs" role="tablist">
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
        <ColumnsView curators={curators} meId={meId} onChanged={() => router.refresh()} />
      ) : (
        <StreamView stream={stream} />
      )}

      <CommentThread comments={comments} onPosted={() => router.refresh()} />

      <div style={{ marginTop: 28 }}>
        <LogoutButton />
      </div>
    </>
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
    <form onSubmit={handleSubmit} className="room-add-pick-wrap" noValidate>
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
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const dirty = text !== initialText;

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/room/note", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Your note for this drop…"
      />
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

function CommentThread({
  comments,
  onPosted,
}: {
  comments: RoomComment[];
  onPosted: () => void;
}) {
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
