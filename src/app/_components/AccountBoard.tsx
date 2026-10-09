"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { artistHref } from "@/lib/artistLink";
import RoleName from "./RoleName";
import ListenerPickForm from "./ListenerPickForm";
import RateDropControl from "./RateDropControl";
import DropTile from "./DropTile";
import FallbackImg from "./FallbackImg";
import CuratorToolsPanel, { type CuratorToolsPanelProps } from "./CuratorToolsPanel";
import PlayableArt from "./PlayableArt";
import { PlayQueue } from "./NowPlayingProvider";

type Member = {
  id: number;
  name: string | null;
  bio: string | null;
  isCurator: boolean;
  /** Whether this visitor has their own Spotify account connected
   * (2026-10-08 "drop control + playback" round — see
   * claude/next-build.md) — src/lib/visitorSpotify.ts, entirely
   * separate from the club's own auto-build connection. Drives
   * SpotifyConnectControl below; playback itself degrades to the
   * 30-second preview regardless of this flag whenever full playback
   * isn't actually available (no Premium, SDK connect failed, etc.) —
   * see NowPlayingProvider.tsx. */
  spotifyConnected: boolean;
};
type OpenDrop = { num: number; title: string | null } | null;
type ListenerPick = { title: string; artist: string; sourceUrl: string | null } | null;

type SubmissionRow = {
  songId: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUri: string | null;
  pickType: "curator" | "listener";
  dropNum: number;
  dropTitle: string | null;
  publishedAt: string | null;
};

type LeaderboardRow = { memberId: number; name: string; isCurator: boolean; pickCount: number };
type PublishedDrop = { id: number; num: number; title: string | null; publishedAt: string; artworkUrls: string[] };

type LikedSong = {
  songId: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  dropNum: number;
};

type AccountBoardProps = {
  member: Member;
  openDrop: OpenDrop;
  listenerPick: ListenerPick;
  submissionHistory: SubmissionRow[];
  likedSongs: LikedSong[];
  leaderboard: LeaderboardRow[];
  publishedDrops: PublishedDrop[];
  favoriteDropIds: number[];
  myRatings: Record<number, number>;
  curatorTools: CuratorToolsPanelProps | null;
};

export default function AccountBoard({
  member,
  openDrop,
  listenerPick,
  submissionHistory,
  likedSongs,
  leaderboard,
  publishedDrops,
  favoriteDropIds,
  myRatings,
  curatorTools,
}: AccountBoardProps) {
  const router = useRouter();
  // "Curator tools" became its own tab, 2026-10-08 (see
  // claude/next-build.md) — previously a collapsible section at the
  // bottom of this same page. curatorTools is only ever non-null for
  // an approved curator (gated server-side in account/page.tsx), so a
  // regular member never sees a tab bar at all — just today's single
  // page, unchanged.
  const [tab, setTab] = useState<"account" | "curator">("account");

  async function logout() {
    await fetch("/api/members/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="gz-up">
      {curatorTools && (
        <div className="acc-tabs">
          <button
            type="button"
            className={`acc-tab${tab === "account" ? " active" : ""}`}
            onClick={() => setTab("account")}
          >
            Your account
          </button>
          <button
            type="button"
            className={`acc-tab${tab === "curator" ? " active" : ""}`}
            onClick={() => setTab("curator")}
          >
            Curator tools
          </button>
        </div>
      )}

      {tab === "curator" && curatorTools ? (
        <CuratorToolsPanel {...curatorTools} />
      ) : (
        <>
          <ProfileCard member={member} />
          <SpotifyConnectControl connected={member.spotifyConnected} />

          <Section label="This cycle's pick">
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

          <Section label="Liked songs">
            <LikedSongsGrid songs={likedSongs} />
          </Section>

          <Section label="Leaderboard">
            <Leaderboard rows={leaderboard} />
          </Section>

          <Section label="Your tops">
            <TopsGrid drops={publishedDrops} initialFavoriteIds={favoriteDropIds} myRatings={myRatings} />
          </Section>
        </>
      )}

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

/**
 * Instagram-style profile editor (2026-10-07 — see claude/next-build.md):
 * static name + bio by default, a small "Edit" trigger opens both
 * fields inline together with Save/Cancel. Name is real-editable here
 * for the first time — it previously had no edit path anywhere, only
 * ever set once at signup. No validation on either field, per the
 * founder's explicit "no guardrails" call.
 */
function ProfileCard({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name ?? "");
  const [bio, setBio] = useState(member.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);

  function startEditing() {
    setName(member.name ?? "");
    setBio(member.bio ?? "");
    setError(null);
    setEditing(true);
    // Auto-grow the bio box to whatever's already in it, not just
    // whatever gets typed next.
    requestAnimationFrame(() => autoGrow(bioRef.current));
  }

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bio }),
      });
      if (res.ok) {
        member.name = name.trim() || null;
        member.bio = bio.trim() || null;
        setEditing(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save your profile. Try again.");
      }
    } catch {
      setError("Couldn't save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div style={{ marginBottom: 30, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div>
          <div style={{ fontSize: 15, marginBottom: 6 }}>
            {/* Bug fix (2026-10 account consolidation, flagged by the
                founder as "weird wording"): this used to fall back to
                the literal word "You", run through RoleName, which
                colors it gold/teal exactly like a real curator/member
                name. Falling back to plain, uncolored copy instead
                makes clear it's a placeholder, not a name. */}
            {member.name?.trim() ? (
              <RoleName name={member.name.trim()} isCurator={member.isCurator} />
            ) : (
              <span className="mut">You haven&rsquo;t set a name yet</span>
            )}
          </div>
          <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            {member.bio?.trim() || "No bio yet."}
          </p>
        </div>
        <button type="button" className="link-btn" style={{ flexShrink: 0 }} onClick={startEditing}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 30 }} className="gz-up">
      <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        <span className="mut" style={{ fontSize: 11.5 }}>
          Name
        </span>
        <input
          type="text"
          className="settings-input"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mut" style={{ fontSize: 11.5 }}>
          Bio
        </span>
        <textarea
          ref={bioRef}
          className="settings-input"
          style={{ resize: "none", overflow: "hidden", padding: "10px 12px", lineHeight: 1.6, minHeight: 44 }}
          placeholder="A short line about you"
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            setError(null);
            autoGrow(e.target);
          }}
        />
      </label>
      {error && (
        <p className="notice error" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button
          type="button"
          className="btn"
          style={{ width: "auto", minHeight: 36, height: 36, padding: "0 14px", fontSize: 12 }}
          disabled={saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="link-btn"
          disabled={saving}
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Small and skippable by design (2026-10-08 "drop control + playback"
 * round — founder's own call, "make the connect spotify link small/
 * skippable"): one quiet line, not its own card or Section — previews
 * work for every visitor regardless, this only ever upgrades playback
 * to full tracks for someone who both connects AND has Spotify
 * Premium (src/lib/visitorSpotify.ts / NowPlayingProvider.tsx). The
 * connect click is a real page navigation (Spotify's OAuth consent
 * screen), not a fetch — Disconnect is the only part that's a fetch.
 */
function SpotifyConnectControl({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/account/spotify/disconnect", { method: "POST" });
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  if (connected) {
    return (
      <p className="mut" style={{ fontSize: 11, marginBottom: 24 }}>
        Spotify connected — full tracks play when you have Premium, previews otherwise.{" "}
        <button
          type="button"
          className="link-btn"
          style={{ fontSize: 11 }}
          onClick={disconnect}
          disabled={disconnecting}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </p>
    );
  }

  return (
    <p className="mut" style={{ fontSize: 11, marginBottom: 24 }}>
      <a href="/api/account/spotify/connect" className="link-btn" style={{ fontSize: 11 }}>
        Connect Spotify for full playback
      </a>{" "}
      — optional, 30-second previews work either way.
    </p>
  );
}

function SubmissionHistory({ rows }: { rows: SubmissionRow[] }) {
  if (rows.length === 0) {
    return <p className="mut" style={{ fontSize: 12.5 }}>No picks yet.</p>;
  }
  return (
    // Player revamp (2026-10-08 — see claude/next-build.md): your own
    // pick history is its own queue — clicking any one plays through
    // every pick you've ever made, in this order.
    <PlayQueue songs={rows}>
      <div className="roster-list">
        {rows.map((row) => (
          <div className="roster-row" key={row.songId}>
            {/* Artwork + play (2026-10-08 "drop control + playback" round
                — see claude/next-build.md) — same PlayableArt everywhere
                else uses, just at this row's own smaller scale. */}
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <PlayableArt
                spotifyUri={row.spotifyUri}
                artworkUrl={row.artworkUrl}
                title={row.title}
                artist={row.artist}
                songId={row.songId}
                className="now-playing-art"
                fallbackClassName="now-playing-art now-playing-art-empty"
              />
              <span className="roster-name" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {row.title} — {row.artist}
              </span>
            </span>
            <span className="roster-meta">
              drop {row.dropNum} · {row.pickType === "curator" ? "curator pick" : "listener pick"}
              {!row.publishedAt && " · not shipped yet"}
            </span>
          </div>
        ))}
      </div>
    </PlayQueue>
  );
}

/**
 * "Liked songs" (2026-10-07 — see claude/next-build.md): replaces the
 * old "Your activity" text feed. Art only, no captions, no border/
 * background box (founder's own call), smaller cells than the standard
 * archive grid (.archive-grid-sm — about 25% smaller). Each tile links
 * to that song's artist page now that Browse/artist pages exist.
 */
function LikedSongsGrid({ songs }: { songs: LikedSong[] }) {
  if (songs.length === 0) {
    return (
      <p className="mut" style={{ fontSize: 12.5 }}>
        Nothing liked yet — songs you like will show up here as artwork.
      </p>
    );
  }
  return (
    <div className="archive-grid-sm">
      {songs.map((song) => (
        <Link
          key={song.songId}
          href={artistHref(song.artist)}
          className="song-tile"
          title={`${song.title} — ${song.artist}`}
        >
          {song.artworkUrl ? (
            <FallbackImg src={song.artworkUrl} className="" fallbackClassName="song-tile-empty" />
          ) : (
            <div className="song-tile-empty" aria-hidden="true" />
          )}
        </Link>
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

/**
 * "Your tops" (2026-10-07 — see claude/next-build.md): merges what
 * used to be two separate sections ("Favorite drops" picker and "Your
 * ratings" list) into one artwork grid — the founder's own call after
 * seeing them side by side ("i dont need an activity feed... but i do
 * [want] the account page to show your likes and ratings like star
 * systems, and show your tops like that"). Each tile is the same
 * DropTile used on /releases, clickable through to the drop itself,
 * with the star rating and the showcase toggle inline underneath so
 * both actions live on the one tile instead of two separate lists.
 */
function TopsGrid({
  drops,
  initialFavoriteIds,
  myRatings,
}: {
  drops: PublishedDrop[];
  initialFavoriteIds: number[];
  myRatings: Record<number, number>;
}) {
  const [favoriteIds, setFavoriteIds] = useState(initialFavoriteIds);
  const [error, setError] = useState<string | null>(null);

  async function saveFavorites(next: number[]) {
    setFavoriteIds(next);
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
    } catch {
      setError("Couldn't save your favorites.");
    }
  }

  function toggleFavorite(dropId: number) {
    if (favoriteIds.includes(dropId)) {
      saveFavorites(favoriteIds.filter((id) => id !== dropId));
      return;
    }
    if (favoriteIds.length >= MAX_FAVORITES) {
      setError(`You can only showcase ${MAX_FAVORITES} drops — remove one first.`);
      return;
    }
    saveFavorites([...favoriteIds, dropId]);
  }

  if (drops.length === 0) {
    return <p className="mut" style={{ fontSize: 12.5 }}>No shipped drops yet.</p>;
  }

  return (
    <div>
      {error && <p className="notice error" style={{ marginBottom: 10 }}>{error}</p>}
      <div className="archive-grid">
        {drops.map((drop) => {
          const isFavorite = favoriteIds.includes(drop.id);
          return (
            <div key={drop.id} className="drop-card-wrap">
              <Link href={`/drop/${drop.num}`} className="drop-card">
                <DropTile num={drop.num} artworkUrls={drop.artworkUrls} framed={false} />
              </Link>
              <div className="tops-tile-title">{drop.title ?? `Drop ${drop.num}`}</div>
              <RateDropControl dropId={drop.id} initialRating={myRatings[drop.id] ?? null} />
              <button
                type="button"
                className={`tops-fav-toggle${isFavorite ? " active" : ""}`}
                onClick={() => toggleFavorite(drop.id)}
              >
                {isFavorite ? "✓ Showcased" : "+ Showcase"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
