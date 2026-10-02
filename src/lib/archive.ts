import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, songs, curatorNotes, curators, top10Entries, type Drop } from "@/db/schema";
import { getTop10Phase } from "./top10";
import { getTop10Summary } from "./top10Data";

/**
 * Public-safe query helpers for the archive + drop detail pages.
 *
 * Anonymity rule (design-handoff.md): public surfaces return
 * `curatorCredit` only — `submittedBy` must never be selected here.
 * This is enforced by simply never including that column in these
 * query results, not by stripping it after the fact.
 */

export type ArchiveDropSummary = {
  num: number;
  title: string | null;
  publishedAt: Date;
  songCount: number;
  /** Up to 4 cover-art URLs, in track order, for the archive tile's
   * quadrant collage — skips songs with no artwork rather than leaving
   * a gap, so a drop with 2 songs that both have art still fills in. */
  artworkUrls: string[];
  /** True once this drop's Top 10 window has closed with at least one
   * vote — drives the small badge on its archive card. A closed window
   * with zero votes shows no badge (nothing to see). */
  hasTop10: boolean;
};

export async function getPublishedDrops(clubId: number): Promise<ArchiveDropSummary[]> {
  const db = getDb();

  const publishedDrops = await db
    .select({
      id: drops.id,
      num: drops.num,
      title: drops.title,
      publishedAt: drops.publishedAt,
    })
    .from(drops)
    .where(and(eq(drops.clubId, clubId), isNotNull(drops.publishedAt)))
    .orderBy(desc(drops.num));

  if (publishedDrops.length === 0) return [];

  const dropIds = publishedDrops.map((d) => d.id);
  const [songRows, top10Rows] = await Promise.all([
    db
      .select({
        dropId: songs.dropId,
        artworkUrl: songs.artworkUrl,
        position: songs.position,
      })
      .from(songs)
      .where(inArray(songs.dropId, dropIds))
      .orderBy(asc(songs.position)),
    db
      .select({ dropId: top10Entries.dropId })
      .from(top10Entries)
      .where(inArray(top10Entries.dropId, dropIds)),
  ]);

  const countByDropId = new Map<number, number>();
  const artworkByDropId = new Map<number, string[]>();
  for (const row of songRows) {
    countByDropId.set(row.dropId, (countByDropId.get(row.dropId) ?? 0) + 1);
    if (row.artworkUrl) {
      const list = artworkByDropId.get(row.dropId) ?? [];
      if (list.length < 4) list.push(row.artworkUrl);
      artworkByDropId.set(row.dropId, list);
    }
  }
  const dropIdsWithVotes = new Set(top10Rows.map((row) => row.dropId));

  return publishedDrops.map((d) => ({
    num: d.num,
    title: d.title,
    // isNotNull filtered this above, so it's safe to assert non-null.
    publishedAt: d.publishedAt as Date,
    songCount: countByDropId.get(d.id) ?? 0,
    artworkUrls: artworkByDropId.get(d.id) ?? [],
    hasTop10: dropIdsWithVotes.has(d.id) && getTop10Phase({ publishedAt: d.publishedAt }) === "closed",
  }));
}

export type PublicSongRow = {
  title: string;
  artist: string;
  curatorCredit: string | null;
  /** The Spotify/Apple Music link a curator pasted in — public, so it's
   * safe to expose (unlike submittedBy, see the anonymity rule above).
   * Used to build each track's embedded player. */
  sourceUrl: string | null;
  artworkUrl: string | null;
};

export type PublicCuratorNote = {
  curatorName: string;
  text: string;
};

export type PublicTop10Row = {
  title: string | null;
  artist: string | null;
  /** null until every row has 2+ votes — src/lib/top10.ts's reveal rule.
   * Rank order is always meaningful even while counts are hidden. */
  votes: number | null;
};

export type PublicTop10 = {
  tally: PublicTop10Row[];
  spotifyUrl: string | null;
  appleUrl: string | null;
};

export type PublicDropDetail = {
  num: number;
  title: string | null;
  publishedAt: Date;
  spotifyUrl: string | null;
  appleUrl: string | null;
  songs: PublicSongRow[];
  notes: PublicCuratorNote[];
  /** null unless the Top 10 window has closed with at least one vote. */
  top10: PublicTop10 | null;
};

export async function getPublicDrop(
  clubId: number,
  num: number
): Promise<PublicDropDetail | null> {
  const db = getDb();

  const [drop] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.clubId, clubId), eq(drops.num, num), isNotNull(drops.publishedAt)))
    .limit(1);

  if (!drop) return null;

  const songRows = await db
    .select({
      title: songs.title,
      artist: songs.artist,
      curatorCredit: songs.curatorCredit,
      sourceUrl: songs.sourceUrl,
      artworkUrl: songs.artworkUrl,
    })
    .from(songs)
    .where(eq(songs.dropId, drop.id))
    .orderBy(asc(songs.position));

  const noteRows = await db
    .select({
      curatorName: curators.name,
      text: curatorNotes.text,
    })
    .from(curatorNotes)
    .innerJoin(curators, eq(curatorNotes.curatorId, curators.id))
    .where(eq(curatorNotes.dropId, drop.id));

  const top10Summary = await getTop10Summary(drop);
  const top10 =
    top10Summary.phase === "closed" && top10Summary.tally.length > 0
      ? {
          tally: top10Summary.tally.map((row) => ({
            title: row.title,
            artist: row.artist,
            votes: top10Summary.revealCounts ? row.votes : null,
          })),
          spotifyUrl: top10Summary.spotifyUrl,
          appleUrl: top10Summary.appleUrl,
        }
      : null;

  return {
    num: drop.num,
    title: drop.title,
    publishedAt: drop.publishedAt as Date,
    spotifyUrl: drop.spotifyUrl,
    appleUrl: drop.appleUrl,
    songs: songRows,
    notes: noteRows,
    top10,
  };
}

/** Newest published drop for a club, or null if nothing's shipped yet —
 * this is what /you always resolves to, regardless of which drop was
 * current when the subscriber's link was originally sent. */
export async function getLatestPublicDrop(clubId: number): Promise<PublicDropDetail | null> {
  const published = await getPublishedDrops(clubId);
  const latest = published[0];
  if (!latest) return null;
  return getPublicDrop(clubId, latest.num);
}

export type { Drop };
