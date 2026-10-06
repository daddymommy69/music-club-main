"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RoleName from "./RoleName";
import ListenerPickForm from "./ListenerPickForm";
import RateDropControl from "./RateDropControl";
import { formatDropMonth } from "@/lib/format";
import { useDirtyField } from "@/lib/useDirtyField";

type Member = { id: number; name: string | null; bio: string | null; isCurator: boolean };
type OpenDrop = { num: number; title: string | null } | null;
type ListenerPick = { title: string; artist: string; sourceUrl: string | null } | null;

type SubmissionRow = {
  songId: number;
  title: string;
  artist: string;
  pickType: "curator" | "listener";
  dropNum: number;
  dropTitle: string | null;
  publishedAt: string | null;
};

type LeaderboardRow = { memberId: number; name: string; isCurator: boolean; pickCount: number };
type PublishedDrop = { id: number; num: number; title: string | null; publishedAt: string };

type AccountBoardProps = {
  member: Member;
  openDrop: OpenDrop;
  listenerPick: ListenerPick;
  submissionHistory: SubmissionRow[];
  leaderboard: LeaderboardRow[];
  publishedDrops: PublishedDrop[];
  favoriteDropIds: number[];
  myRatings: Record<number, number>;
};

export default function AccountBoard({
  member,
  openDrop,
  listenerPick,
  submissionHistory,
  leaderboard,
  publishedDrops,
  favoriteDropIds,
  myRatings,
}: AccountBoardProps) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/members/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="gz-up">
      <ProfileCard member={member} />

      {/* Curator-only section stays deliberately lightweight for v1 —
          see this component's own header comment below the exports for
          the scoping call. The real pick/ship tooling stays at /room
          and /overview rather than being re-ported here. */}
      {member.isCurator && (
        <div className="acc-panel" style={{ marginBottom: 30 }}>
          <p className="label" style={{ marginBottom: 10 }}>
            Curator tools
          </p>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>
            Picking songs, writing notes, and shipping the drop still happen in
            the curator workspace, not here.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/room" className="btn btn-outline" style={{ width: "auto", padding: "0 16px" }}>
              Open Room
            </Link>
            <Link href="/overview" className="btn btn-outline" style={{ width: "auto", padding: "0 16px" }}>
              Open Overview
            </Link>
          </div>
        </div>
      )}

      <Section label="Your Listener Pick">
        {openDrop ? (
          <ListenerPickForm openDrop={openDrop} initialPick={listenerPick} />
        ) : (
          <p className="mut" style={{ fontSize: 12.5 }}>
            No drop is open for submissions right now.
          </p>
        )}
      </Section>

      <Section label="Your picks, all time">
        <SubmissionHistory rows={submissionHistory} />
      </Section>

      <Section label="Leaderboard">
        <Leaderboard rows={leaderboard} />
      </Section>

      <Section label="Favorite drops">
        <FavoritesPicker drops={publishedDrops} initialFavoriteIds={favoriteDropIds} />
      </Section>

      <Section label="Your ratings">
        <RatingsList drops={publishedDrops} myRatings={myRatings} />
      </Section>

      <button type="button" className="link-btn" onClick={logout} style={{ marginTop: 10 }}>
        Log out
      </button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="label" style={{ marginBottom: 12 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/** Name (role-colored) + an inline-editable bio, same dirty-state Save pattern as /room's curator note and /settings' club rename. */
function ProfileCard({ member }: { member: Member }) {
  const { value: bio, setValue: setBio, setSaved, dirty } = useDirtyField(member.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio }),
      });
      if (res.ok) {
        setSaved(bio);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save your bio. Try again.");
      }
    } catch {
      setError("Couldn't save your bio. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ fontSize: 15, marginBottom: 10 }}>
        <RoleName name={member.name?.trim() || "You"} isCurator={member.isCurator} />
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mut" style={{ fontSize: 11.5 }}>
          Bio
        </span>
        <textarea
          className="settings-input"
          style={{ minHeight: 72, resize: "vertical", padding: "10px 12px", lineHeight: 1.6 }}
          placeholder="A short line about you"
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            setError(null);
          }}
        />
      </label>
      {error && (
        <p className="notice error" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
      {dirty && (
        <button
          type="button"
          className="btn"
          style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12, marginTop: 10 }}
          disabled={saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}

function SubmissionHistory({ rows }: { rows: SubmissionRow[] }) {
  if (rows.length === 0) {
    return <p className="mut" style={{ fontSize: 12.5 }}>No picks yet.</p>;
  }
  return (
    <div className="roster-list">
      {rows.map((row) => (
        <div className="roster-row" key={row.songId}>
          <span className="roster-name">
            {row.title} — {row.artist}
          </span>
          <span className="roster-meta">
            drop {row.dropNum} · {row.pickType === "curator" ? "curator pick" : "listener pick"}
            {!row.publishedAt && " · not shipped yet"}
          </span>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return <p className="mut" style={{ fontSize: 12.5 }}>No shipped picks yet.</p>;
  }
  return (
    <div className="roster-list">
      {rows.map((row, i) => (
        <div className="roster-row" key={row.memberId}>
          <span className="roster-name">
            {i + 1}. <RoleName name={row.name || "Member"} isCurator={row.isCurator} />
          </span>
          <span className="roster-meta">
            {row.pickCount} pick{row.pickCount === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </div>
  );
}

const MAX_FAVORITES = 5;

/** Click a drop to add it to your showcase (in click order), click again to remove — settable, not drag-reorderable, per the build's "reorderable or at least settable" allowance. */
function FavoritesPicker({ drops, initialFavoriteIds }: { drops: PublishedDrop[]; initialFavoriteIds: number[] }) {
  const [favoriteIds, setFavoriteIds] = useState(initialFavoriteIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: number[]) {
    setFavoriteIds(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropIds: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save your favorites.");
      }
    } finally {
      setSaving(false);
    }
  }

  function toggle(dropId: number) {
    if (favoriteIds.includes(dropId)) {
      save(favoriteIds.filter((id) => id !== dropId));
      return;
    }
    if (favoriteIds.length >= MAX_FAVORITES) {
      setError(`You can only showcase ${MAX_FAVORITES} drops — remove one first.`);
      return;
    }
    save([...favoriteIds, dropId]);
  }

  if (drops.length === 0) {
    return <p className="mut" style={{ fontSize: 12.5 }}>No shipped drops to pick from yet.</p>;
  }

  return (
    <div>
      <p className="mut" style={{ fontSize: 11.5, marginBottom: 10 }}>
        Pick up to {MAX_FAVORITES}. {saving && "Saving…"}
      </p>
      {error && <p className="notice error" style={{ marginBottom: 10 }}>{error}</p>}
      <div className="roster-list">
        {drops.map((drop) => {
          const slot = favoriteIds.indexOf(drop.id);
          const isFavorite = slot !== -1;
          return (
            <button
              key={drop.id}
              type="button"
              onClick={() => toggle(drop.id)}
              className="roster-row"
              style={{
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                color: isFavorite ? "var(--accent)" : "inherit",
              }}
            >
              <span className="roster-name">
                {isFavorite ? `${slot + 1}. ` : ""}
                {drop.title ?? `Drop ${drop.num}`}
              </span>
              <span className="roster-meta">{formatDropMonth(new Date(drop.publishedAt))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Reuses RateDropControl (the same widget the release page uses)
// instead of its own star-row — this used to reimplement the same
// 1-5 rating UI against the identical /api/account/rating endpoint
// with its own, less complete version of the logic (no real error
// handling), a second copy to keep in sync for no reason (2026-10-06
// QA sweep finding).
function RatingsList({ drops, myRatings }: { drops: PublishedDrop[]; myRatings: Record<number, number> }) {
  if (drops.length === 0) {
    return <p className="mut" style={{ fontSize: 12.5 }}>No shipped drops to rate yet.</p>;
  }

  return (
    <div className="roster-list">
      {drops.map((drop) => (
        <div className="roster-row" key={drop.id}>
          <span className="roster-name">{drop.title ?? `Drop ${drop.num}`}</span>
          <RateDropControl dropId={drop.id} initialRating={myRatings[drop.id] ?? null} />
        </div>
      ))}
    </div>
  );
}
