import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs, drops, artistSpotifyCache, type Club } from "@/db/schema";
import { normalizeArtistName, isUniqueViolation } from "./normalize";
import { getSpotifyAccessToken, searchSpotifyArtist } from "./spotify";
import { getLikeCounts } from "./songLikes";
import { getSongRatingSummaries, type SongRatingSummary } from "./songRatings";

export { artistHref } from "./artistLink";

/**
 * Artist pages (2026-10-07 "Browse" round — see claude/next-build.md).
 * There's no real artist entity in this schema — songs.artist is free
 * text (design constraint flagged before building this) — so every
 * function here groups songs by normalizeArtistName(artist) rather
 * than a foreign key, and "this artist's page" is really just "every
 * song whose artist text normalizes to this key."
 */

export type ArtistSongEntry = {
  songId: number;
  title: string;
  dropId: number;
  dropNum: number;
  dropTitle: string | null;
  likeCount: number;
  rating: SongRatingSummary;
  /** Public attribution — curator credit ONLY (founder's explicit call:
   * a Listener Pick's real submitter, public elsewhere on the drop
   * page, stays unattributed here). Null for a Listener Pick, or for a
   * Curator Pick nobody claimed credit for. */
  curatorCredit: string | null;
  /** PRIVATE — true only when the viewer themselves curated or
   * submitted this song (as curator via curatorId, or as a listener via
   * submittedByMemberId) — never shown to anyone else. Always false
   * when no viewer is signed in. */
  isOwnPick: boolean;
};

export type ArtistPageData = {
  displayName: string;
  normalizedName: string;
  photoUrl: string | null;
  dropCount: number;
  totalLikes: number;
  mostLikedSong: { songId: number; title: string; likeCount: number } | null;
  songs: ArtistSongEntry[];
};

/** Everything an artist's page needs, or null if no published song's
 * artist text normalizes to this key — artist pages are purely derived
 * from song data, so there's no separate "does this artist exist" flag
 * to check. */
export async function getArtistPageData(
  club: Club,
  normalizedName: string,
  viewerMemberId?: number | null
): Promise<ArtistPageData | null> {
  const db = getDb();

  const rows = await db
    .select({
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      dropId: songs.dropId,
      dropNum: drops.num,
      dropTitle: drops.title,
      curatorCredit: songs.curatorCredit,
      curatorId: songs.curatorId,
      submittedByMemberId: songs.submittedByMemberId,
      pickType: songs.pickType,
    })
    .from(songs)
    .innerJoin(drops, eq(songs.dropId, drops.id))
    .where(and(eq(drops.clubId, club.id), isNotNull(drops.publishedAt)));

  const matches = rows.filter((r) => normalizeArtistName(r.artist) === normalizedName);
  if (matches.length === 0) return null;

  const songIds = matches.map((m) => m.id);
  const [likeCounts, ratingSummaries] = await Promise.all([
    getLikeCounts(songIds),
    getSongRatingSummaries(songIds),
  ]);

  const songsOut: ArtistSongEntry[] = matches
    .map((m) => ({
      songId: m.id,
      title: m.title,
      dropId: m.dropId,
      dropNum: m.dropNum,
      dropTitle: m.dropTitle,
      likeCount: likeCounts.get(m.id) ?? 0,
      rating: ratingSummaries.get(m.id) ?? { average: null, count: 0 },
      curatorCredit: m.pickType === "curator" ? m.curatorCredit : null,
      isOwnPick:
        viewerMemberId != null && (m.curatorId === viewerMemberId || m.submittedByMemberId === viewerMemberId),
    }))
    .sort((a, b) => b.dropNum - a.dropNum);

  const dropCount = new Set(matches.map((m) => m.dropId)).size;
  const totalLikes = songsOut.reduce((sum, s) => sum + s.likeCount, 0);
  const mostLikedSong = songsOut.reduce<ArtistSongEntry | null>(
    (best, s) => (!best || s.likeCount > best.likeCount ? s : best),
    null
  );

  // First-seen raw casing stands in for a "display name" — there's no
  // canonical casing to prefer since there's no real artist entity.
  const displayName = matches[0].artist;
  const photoUrl = await getOrFetchArtistPhoto(club, normalizedName, displayName);

  return {
    displayName,
    normalizedName,
    photoUrl,
    dropCount,
    totalLikes,
    mostLikedSong:
      mostLikedSong && mostLikedSong.likeCount > 0
        ? { songId: mostLikedSong.songId, title: mostLikedSong.title, likeCount: mostLikedSong.likeCount }
        : null,
    songs: songsOut,
  };
}

/**
 * Cache-or-fetch an artist's Spotify photo (2026-10-07 — see
 * claude/next-build.md: "pull spotify data now that i know there's no
 * real repercussion"). Cached forever once resolved — no TTL, no
 * override UI yet (founder's own call: "ill fix later," i.e. by
 * deleting the cache row to force a re-fetch). Null, not a throw,
 * whenever Spotify search should just be skipped: no cached row yet,
 * no club Spotify connection, or the lookup itself failing — every
 * caller treats null as "show the gradient placeholder instead."
 */
export async function getOrFetchArtistPhoto(
  club: Club,
  normalizedName: string,
  displayNameHint: string
): Promise<string | null> {
  const db = getDb();
  const [cached] = await db
    .select({ photoUrl: artistSpotifyCache.photoUrl })
    .from(artistSpotifyCache)
    .where(eq(artistSpotifyCache.normalizedName, normalizedName))
    .limit(1);
  if (cached) return cached.photoUrl;

  const accessToken = await getSpotifyAccessToken(club);
  if (!accessToken) return null;

  const match = await searchSpotifyArtist(accessToken, displayNameHint);
  const photoUrl = match?.photoUrl ?? null;

  try {
    await db.insert(artistSpotifyCache).values({
      normalizedName,
      spotifyArtistId: match?.id ?? null,
      photoUrl,
    });
  } catch (err) {
    // Lost a race with a concurrent lookup for the same artist — fine,
    // the other write already cached it; this isn't a real failure.
    if (!isUniqueViolation(err)) throw err;
  }

  return photoUrl;
}
