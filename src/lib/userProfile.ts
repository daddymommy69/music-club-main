import { and, asc, desc, eq, isNotNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs, drops, curatorNotes, songNotes, members } from "@/db/schema";
import { getLikeCounts } from "./songLikes";
import { getSongRatingSummaries, type SongRatingSummary } from "./songRatings";

/**
 * Public "user" profile pages (/u/[slug], 2026-10-19 — founder's own
 * ask, expanded from an original "contributing curators" request into
 * a full public profile every member gets, curator or not: "i like
 * user better... curators and non curators are all under the same
 * umbrella"). Mirrors src/lib/artists.ts's getArtistPageData in shape,
 * but keyed by the member's stable slug rather than a normalized
 * free-text name, and covering a real `members` row (name/bio/stats)
 * rather than purely song-derived data.
 *
 * Deliberately covers BOTH pick types (Curator Picks via curatorId,
 * Listener Picks via submittedByMemberId) — "user" is meant to be
 * general-purpose per the founder's own terminology choice, even though
 * Listener Picks aren't really an active feature yet. Scoped to
 * published drops only, same privacy boundary as every other public
 * query in this app.
 */

export type UserProfileSongEntry = {
  songId: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUri: string | null;
  dropNum: number;
  dropTitle: string | null;
  pickType: "curator" | "listener";
  likeCount: number;
  rating: SongRatingSummary;
};

export type UserProfileBlurb = {
  /** "drop" = a curator's note about the whole drop (curatorNotes);
   * "song" = a per-song note (songNotes) — songTitle is only set for
   * the latter. */
  kind: "drop" | "song";
  dropNum: number;
  songTitle: string | null;
  text: string;
  createdAt: Date;
};

export type UserProfileData = {
  name: string;
  bio: string | null;
  slug: string;
  isCurator: boolean;
  dropCount: number;
  songCount: number;
  songs: UserProfileSongEntry[];
  blurbs: UserProfileBlurb[];
};

/** Everything a member's public profile page needs, or null if no
 * member has this slug. slug is globally unique (not club-scoped, see
 * db/schema.ts), so this doesn't take a club at all — same reasoning as
 * src/lib/members.ts's getMemberBySlug. */
export async function getUserProfileData(slug: string): Promise<UserProfileData | null> {
  const db = getDb();

  const [member] = await db.select().from(members).where(eq(members.slug, slug)).limit(1);
  if (!member) return null;

  const rows = await db
    .select({
      songId: songs.id,
      title: songs.title,
      artist: songs.artist,
      artworkUrl: songs.artworkUrl,
      spotifyUri: songs.spotifyUri,
      dropId: songs.dropId,
      dropNum: drops.num,
      dropTitle: drops.title,
      pickType: songs.pickType,
      createdAt: songs.createdAt,
    })
    .from(songs)
    .innerJoin(drops, eq(songs.dropId, drops.id))
    .where(
      and(
        isNotNull(drops.publishedAt),
        or(
          and(eq(songs.pickType, "curator"), eq(songs.curatorId, member.id)),
          and(eq(songs.pickType, "listener"), eq(songs.submittedByMemberId, member.id))
        )
      )
    )
    .orderBy(desc(drops.num), asc(songs.position));

  const songIds = rows.map((r) => r.songId);
  const [likeCounts, ratingSummaries] = await Promise.all([
    getLikeCounts(songIds),
    getSongRatingSummaries(songIds),
  ]);

  const songsOut: UserProfileSongEntry[] = rows.map((r) => ({
    songId: r.songId,
    title: r.title,
    artist: r.artist,
    artworkUrl: r.artworkUrl,
    spotifyUri: r.spotifyUri,
    dropNum: r.dropNum,
    dropTitle: r.dropTitle,
    pickType: r.pickType,
    likeCount: likeCounts.get(r.songId) ?? 0,
    rating: ratingSummaries.get(r.songId) ?? { average: null, count: 0 },
  }));

  const dropCount = new Set(rows.map((r) => r.dropId)).size;

  // Blurbs: this member's own written notes, drop-level and per-song,
  // scoped to published drops only — same two tables DropDetail.tsx
  // already reads for the drop-page view, just filtered to one author
  // instead of one drop.
  const [dropNoteRows, songNoteRows] = await Promise.all([
    db
      .select({
        text: curatorNotes.text,
        createdAt: curatorNotes.createdAt,
        dropNum: drops.num,
      })
      .from(curatorNotes)
      .innerJoin(drops, eq(curatorNotes.dropId, drops.id))
      .where(and(eq(curatorNotes.curatorId, member.id), isNotNull(drops.publishedAt)))
      .orderBy(asc(curatorNotes.createdAt)),
    db
      .select({
        text: songNotes.text,
        createdAt: songNotes.createdAt,
        dropNum: drops.num,
        songTitle: songs.title,
      })
      .from(songNotes)
      .innerJoin(songs, eq(songNotes.songId, songs.id))
      .innerJoin(drops, eq(songs.dropId, drops.id))
      .where(and(eq(songNotes.curatorId, member.id), isNotNull(drops.publishedAt)))
      .orderBy(asc(songNotes.createdAt)),
  ]);

  const blurbs: UserProfileBlurb[] = [
    ...dropNoteRows.map((r) => ({
      kind: "drop" as const,
      dropNum: r.dropNum,
      songTitle: null,
      text: r.text,
      createdAt: r.createdAt,
    })),
    ...songNoteRows.map((r) => ({
      kind: "song" as const,
      dropNum: r.dropNum,
      songTitle: r.songTitle,
      text: r.text,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    name: member.name?.trim() || "a member",
    bio: member.bio,
    slug: member.slug as string,
    isCurator: member.isCurator,
    dropCount,
    songCount: songsOut.length,
    songs: songsOut,
    blurbs,
  };
}

export type UserDirectoryEntry = {
  name: string;
  slug: string;
  isCurator: boolean;
  /** Total songs across both pick types, published drops only — the
   * same scope as getUserProfileData's songCount, just precomputed for
   * every member in one pass so Browse's Users tab doesn't need N
   * profile loads. */
  songCount: number;
};

/** Every member on the site, for Browse's "Users" tab (2026-10-19 —
 * founder: "i like in the browse area, since thats where all music is
 * going to be living already... a users tab in browse so it can
 * include anyone who is apart of the website"). Deliberately NOT
 * scoped to curators or contributors only — "i think everyone does"
 * get a profile page, per the founder's own answer. Ordered curators
 * first (closer to what Browse's other sections already feel like —
 * the people most associated with the music up top), then by name. */
export async function getAllUsersDirectory(clubId: number): Promise<UserDirectoryEntry[]> {
  const db = getDb();

  const [memberRows, songCountRows] = await Promise.all([
    db
      .select({ id: members.id, name: members.name, slug: members.slug, isCurator: members.isCurator })
      .from(members)
      .where(and(eq(members.clubId, clubId), isNotNull(members.slug))),
    db
      .select({
        curatorId: songs.curatorId,
        submittedByMemberId: songs.submittedByMemberId,
        pickType: songs.pickType,
      })
      .from(songs)
      .innerJoin(drops, eq(songs.dropId, drops.id))
      .where(and(eq(drops.clubId, clubId), isNotNull(drops.publishedAt))),
  ]);

  const songCountByMemberId = new Map<number, number>();
  for (const row of songCountRows) {
    const memberId = row.pickType === "curator" ? row.curatorId : row.submittedByMemberId;
    if (memberId == null) continue;
    songCountByMemberId.set(memberId, (songCountByMemberId.get(memberId) ?? 0) + 1);
  }

  return memberRows
    .map((m) => ({
      name: m.name?.trim() || "a member",
      slug: m.slug as string,
      isCurator: m.isCurator,
      songCount: songCountByMemberId.get(m.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.isCurator !== b.isCurator) return a.isCurator ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
