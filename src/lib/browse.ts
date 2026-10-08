import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs, drops, type Club } from "@/db/schema";
import { normalizeArtistName } from "./normalize";
import { getLikeCounts } from "./songLikes";
import { getSongRatingSummary, getSongRatingSummaries, type SongRatingSummary } from "./songRatings";

/**
 * /browse (2026-10-07 — see claude/next-build.md): replaces /submit.
 * Default view is a plain directory of everything that's actually been
 * featured on the site — every artist and every song from a published
 * drop — browsable with no typing required. The one search bar on the
 * page is a separate thing (live Spotify search, see getSongSiteStats
 * below): this file's directory functions never call Spotify at all.
 */

export type ArtistDirectoryEntry = {
  normalizedName: string;
  displayName: string;
  dropCount: number;
  songCount: number;
};

export type BrowseSongEntry = {
  songId: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUri: string | null;
};

/** How many songs the Songs grid shows, newest drop first — same spirit
 * as /account's Liked Songs cap, so this doesn't grow into an
 * unbounded grid as more drops ship. */
const BROWSE_SONGS_LIMIT = 40;

export type BrowseDirectory = {
  artists: ArtistDirectoryEntry[];
  songs: BrowseSongEntry[];
};

export async function getBrowseDirectory(clubId: number): Promise<BrowseDirectory> {
  const db = getDb();

  const rows = await db
    .select({
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      artworkUrl: songs.artworkUrl,
      spotifyUri: songs.spotifyUri,
      dropId: songs.dropId,
      dropNum: drops.num,
      position: songs.position,
    })
    .from(songs)
    .innerJoin(drops, eq(songs.dropId, drops.id))
    .where(and(eq(drops.clubId, clubId), isNotNull(drops.publishedAt)))
    .orderBy(desc(drops.num), songs.position);

  const artistsByKey = new Map<string, { displayName: string; dropIds: Set<number>; songCount: number }>();
  for (const row of rows) {
    const key = normalizeArtistName(row.artist);
    const entry = artistsByKey.get(key) ?? { displayName: row.artist, dropIds: new Set<number>(), songCount: 0 };
    entry.dropIds.add(row.dropId);
    entry.songCount += 1;
    artistsByKey.set(key, entry);
  }

  const artists: ArtistDirectoryEntry[] = Array.from(artistsByKey.entries())
    .map(([normalizedName, v]) => ({
      normalizedName,
      displayName: v.displayName,
      dropCount: v.dropIds.size,
      songCount: v.songCount,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const songsOut: BrowseSongEntry[] = rows.slice(0, BROWSE_SONGS_LIMIT).map((r) => ({
    songId: r.id,
    title: r.title,
    artist: r.artist,
    artworkUrl: r.artworkUrl,
    spotifyUri: r.spotifyUri,
  }));

  return { artists, songs: songsOut };
}

export type SongSiteStats = {
  songId: number;
  dropNum: number;
  likeCount: number;
  rating: SongRatingSummary;
} | null;

/** Whether a Spotify search result is already a song that's been
 * featured on the site — matched by normalized title+artist text (same
 * "no real entity, match on text" constraint as everywhere else, since
 * a search result has no local songId to join on). Best-effort, one
 * lookup per result — fine at this app's scale, same pattern as the
 * per-track Spotify matching already in src/lib/spotify.ts. */
export async function getSongSiteStats(club: Club, title: string, artist: string): Promise<SongSiteStats> {
  const db = getDb();
  const normTitle = title.trim().toLowerCase();
  const normArtist = normalizeArtistName(artist);

  const [row] = await db
    .select({ id: songs.id, dropNum: drops.num })
    .from(songs)
    .innerJoin(drops, eq(songs.dropId, drops.id))
    .where(
      and(
        eq(drops.clubId, club.id),
        isNotNull(drops.publishedAt),
        sql`lower(trim(${songs.title})) = ${normTitle}`,
        sql`lower(trim(${songs.artist})) = ${normArtist}`
      )
    )
    .limit(1);

  if (!row) return null;

  const [likeCounts, rating] = await Promise.all([getLikeCounts([row.id]), getSongRatingSummary(row.id)]);
  return { songId: row.id, dropNum: row.dropNum, likeCount: likeCounts.get(row.id) ?? 0, rating };
}

export type SiteSearchResult = {
  songId: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUri: string | null;
  dropNum: number;
  likeCount: number;
  rating: SongRatingSummary;
};

/**
 * Browse's "search this site" mode (2026-10-08 — see
 * claude/next-build.md: the founder wants to check "have we already
 * done this song/artist" without typing into Spotify's index first).
 * Unlike the Spotify-search path, every result already has a real
 * songId and real stats attached — there's no separate stats lookup to
 * do, this IS the stats. Matches by a simple case-insensitive
 * substring on title OR artist, same spirit as a quick filter rather
 * than a full-text search engine — fine at this app's scale.
 */
export async function searchSiteSongs(clubId: number, query: string, limit = 12): Promise<SiteSearchResult[]> {
  const db = getDb();
  const like = `%${query.trim().toLowerCase()}%`;

  const rows = await db
    .select({
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      artworkUrl: songs.artworkUrl,
      spotifyUri: songs.spotifyUri,
      dropId: songs.dropId,
      dropNum: drops.num,
    })
    .from(songs)
    .innerJoin(drops, eq(songs.dropId, drops.id))
    .where(
      and(
        eq(drops.clubId, clubId),
        isNotNull(drops.publishedAt),
        or(sql`lower(${songs.title}) LIKE ${like}`, sql`lower(${songs.artist}) LIKE ${like}`)
      )
    )
    .orderBy(desc(drops.num))
    .limit(limit);

  const songIds = rows.map((r) => r.id);
  const [likeCounts, ratings] = await Promise.all([getLikeCounts(songIds), getSongRatingSummaries(songIds)]);

  return rows.map((r) => ({
    songId: r.id,
    title: r.title,
    artist: r.artist,
    artworkUrl: r.artworkUrl,
    spotifyUri: r.spotifyUri,
    dropNum: r.dropNum,
    likeCount: likeCounts.get(r.id) ?? 0,
    rating: ratings.get(r.id) ?? { average: null, count: 0 },
  }));
}
