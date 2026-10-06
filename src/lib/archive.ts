import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { drops, songs, curatorNotes, members, top10Entries, type Drop } from "@/db/schema";
import { getTop10Phase } from "./top10";
import { getTop10Summary } from "./top10Data";
import { getLikeCounts } from "./songLikes";
import { getDropRatingSummary } from "./ratings";
import { getDropLikeCounts } from "./dropLikes";

// Aliased so a Listener Pick's submittedByMemberId -> members join
// (for its public listenerCredit name) can't collide with the
// unrelated curatorNotes -> members join further down this file.
const membersListener = alias(members, "members_listener");

/**
 * Public-safe query helpers for the archive + drop detail pages.
 *
 * Anonymity rule (design-handoff.md): public surfaces return
 * `curatorCredit` only — `submittedBy` must never be selected here.
 * This is enforced by simply never including that column in these
 * query results, not by stripping it after the fact.
 */

export type ArchiveDropSummary = {
  /** The real drops.id — needed anywhere that writes against a specific
   * drop (favorites, ratings) rather than just displaying it by number. */
  id: number;
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
  /** How many Listener Picks this cycle has — drives the secondary
   * "Listener Pick playlist" card on the archive page (2026-10
   * release-page redesign — see claude/next-build.md). Zero means no
   * card is shown for this cycle at all. */
  listenerPickCount: number;
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
        pickType: songs.pickType,
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
  const listenerPickCountByDropId = new Map<number, number>();
  for (const row of songRows) {
    countByDropId.set(row.dropId, (countByDropId.get(row.dropId) ?? 0) + 1);
    if (row.artworkUrl) {
      const list = artworkByDropId.get(row.dropId) ?? [];
      if (list.length < 4) list.push(row.artworkUrl);
      artworkByDropId.set(row.dropId, list);
    }
    if (row.pickType === "listener") {
      listenerPickCountByDropId.set(row.dropId, (listenerPickCountByDropId.get(row.dropId) ?? 0) + 1);
    }
  }
  const dropIdsWithVotes = new Set(top10Rows.map((row) => row.dropId));

  return publishedDrops.map((d) => ({
    id: d.id,
    num: d.num,
    title: d.title,
    // isNotNull filtered this above, so it's safe to assert non-null.
    publishedAt: d.publishedAt as Date,
    songCount: countByDropId.get(d.id) ?? 0,
    artworkUrls: artworkByDropId.get(d.id) ?? [],
    hasTop10: dropIdsWithVotes.has(d.id) && getTop10Phase({ publishedAt: d.publishedAt }) === "closed",
    listenerPickCount: listenerPickCountByDropId.get(d.id) ?? 0,
  }));
}

export type PublicSongRow = {
  id: number;
  title: string;
  artist: string;
  curatorCredit: string | null;
  /** The Spotify/Apple Music link a curator pasted in — public, so it's
   * safe to expose (unlike submittedBy, see the anonymity rule above).
   * Used to build each track's embedded player. */
  sourceUrl: string | null;
  artworkUrl: string | null;
  /** 'curator' (unchanged default) or 'listener' — which public section
   * (Curator Picks / Listener Picks) this song shows under. */
  pickType: "curator" | "listener";
  /** The real submitting member's name, public, ONLY for a Listener
   * Pick (2026-10 policy change — see claude/next-build.md: "both
   * Curator Picks and Listener Picks get public picked-by credit on
   * the release page," going forward from this column's introduction).
   * Null for a Curator Pick — that credit is curatorCredit instead. */
  listenerCredit: string | null;
  /** Whether the member behind listenerCredit is themselves a curator
   * (a curator can have their own personal Listener Pick, a different
   * row/role from any Curator Pick they own — see schema.ts) — drives
   * which role color RoleName renders. Meaningless when listenerCredit
   * is null. */
  listenerIsCurator: boolean;
  likeCount: number;
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
  /** The real drops.id — needed for anything that writes against this
   * specific drop (ratings) rather than just displaying it by number. */
  id: number;
  num: number;
  title: string | null;
  publishedAt: Date;
  spotifyUrl: string | null;
  appleUrl: string | null;
  songs: PublicSongRow[];
  notes: PublicCuratorNote[];
  /** null unless the Top 10 window has closed with at least one vote. */
  top10: PublicTop10 | null;
  /** Public average + count — see src/lib/ratings.ts. average is null
   * when nobody's rated this drop yet; the release page hides the line
   * entirely in that case rather than showing "0". */
  rating: { average: number | null; count: number };
  /** Whole-drop like count (2026-10 release-page redesign — see
   * claude/next-build.md). Public, same spirit as song likes — whether
   * the CURRENT viewer has liked/saved this drop is fetched separately
   * (src/lib/dropLikes.ts / dropSaves.ts), same pattern as viewerRating
   * in src/app/drop/[num]/page.tsx, since that's viewer-specific and
   * this type is viewer-independent public data. */
  dropLikeCount: number;
  /** The on-demand Listener Pick playlist, if a curator has built one —
   * null/null until then. Never auto-built, never sent out. */
  listenerPlaylistUrl: string | null;
  listenerPlaylistBuiltAt: Date | null;
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
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      curatorCredit: songs.curatorCredit,
      sourceUrl: songs.sourceUrl,
      artworkUrl: songs.artworkUrl,
      pickType: songs.pickType,
      submittedByMemberId: songs.submittedByMemberId,
      listenerName: membersListener.name,
      listenerIsCurator: membersListener.isCurator,
    })
    .from(songs)
    // Left join, not inner — a Curator Pick has no submittedByMemberId
    // at all, and this join must not drop those rows. Aliased
    // (membersListener) so this doesn't collide with the curator-notes
    // join on `members` further down in this same function.
    .leftJoin(membersListener, eq(songs.submittedByMemberId, membersListener.id))
    .where(eq(songs.dropId, drop.id))
    .orderBy(asc(songs.position));

  const [likeCounts, ratingSummary, dropLikeCounts] = await Promise.all([
    getLikeCounts(songRows.map((s) => s.id)),
    getDropRatingSummary(drop.id),
    getDropLikeCounts([drop.id]),
  ]);

  const publicSongs: PublicSongRow[] = songRows.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    curatorCredit: s.curatorCredit,
    sourceUrl: s.sourceUrl,
    artworkUrl: s.artworkUrl,
    pickType: s.pickType,
    listenerCredit: s.pickType === "listener" ? s.listenerName ?? null : null,
    listenerIsCurator: s.pickType === "listener" ? s.listenerIsCurator ?? false : false,
    likeCount: likeCounts.get(s.id) ?? 0,
  }));

  // members.name is nullable (unlike the old curators.name, which was
  // required) — coalesce so PublicCuratorNote.curatorName stays a plain
  // string, same contract this page has always had.
  const noteRows = (
    await db
      .select({
        curatorName: members.name,
        text: curatorNotes.text,
      })
      .from(curatorNotes)
      .innerJoin(members, eq(curatorNotes.curatorId, members.id))
      .where(eq(curatorNotes.dropId, drop.id))
  ).map((row) => ({ curatorName: row.curatorName ?? "", text: row.text }));

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
    id: drop.id,
    num: drop.num,
    title: drop.title,
    publishedAt: drop.publishedAt as Date,
    spotifyUrl: drop.spotifyUrl,
    appleUrl: drop.appleUrl,
    songs: publicSongs,
    notes: noteRows,
    top10,
    rating: ratingSummary,
    dropLikeCount: dropLikeCounts.get(drop.id) ?? 0,
    listenerPlaylistUrl: drop.listenerPlaylistUrl,
    listenerPlaylistBuiltAt: drop.listenerPlaylistBuiltAt,
  };
}

export type PublicListenerPick = {
  id: number;
  title: string;
  artist: string;
  sourceUrl: string | null;
  artworkUrl: string | null;
  spotifyUri: string | null;
  /** The real submitting member's name, public (2026-10 policy — see
   * the pickType comment on the songs table in schema.ts). Falls back
   * to a plain label on the rare row where the member has since been
   * deleted (submittedByMemberId -> set null) rather than showing
   * nothing. */
  credit: string;
  creditIsCurator: boolean;
};

export type ListenerPicksForDrop = {
  dropId: number;
  dropNum: number;
  title: string | null;
  publishedAt: Date;
  songs: PublicListenerPick[];
  listenerPlaylistUrl: string | null;
  listenerPlaylistBuiltAt: Date | null;
};

/** A published drop's Listener Picks (2026-10 release-page redesign —
 * see claude/next-build.md), for the dedicated /drop/[num]/listener-
 * picks page this round added. Null if the drop doesn't exist, isn't
 * published yet, or has no Listener Picks at all — the page 404s on
 * any of those rather than rendering an empty shell. */
export async function getListenerPicksForDrop(
  clubId: number,
  num: number
): Promise<ListenerPicksForDrop | null> {
  const db = getDb();

  const [drop] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.clubId, clubId), eq(drops.num, num), isNotNull(drops.publishedAt)))
    .limit(1);
  if (!drop) return null;

  const rows = await db
    .select({
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      sourceUrl: songs.sourceUrl,
      artworkUrl: songs.artworkUrl,
      spotifyUri: songs.spotifyUri,
      memberName: membersListener.name,
      memberIsCurator: membersListener.isCurator,
    })
    .from(songs)
    .leftJoin(membersListener, eq(songs.submittedByMemberId, membersListener.id))
    .where(and(eq(songs.dropId, drop.id), eq(songs.pickType, "listener")))
    .orderBy(asc(songs.position));

  if (rows.length === 0) return null;

  return {
    dropId: drop.id,
    dropNum: drop.num,
    title: drop.title,
    publishedAt: drop.publishedAt as Date,
    songs: rows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      sourceUrl: r.sourceUrl,
      artworkUrl: r.artworkUrl,
      spotifyUri: r.spotifyUri,
      credit: r.memberName ?? "a listener",
      creditIsCurator: r.memberIsCurator ?? false,
    })),
    listenerPlaylistUrl: drop.listenerPlaylistUrl,
    listenerPlaylistBuiltAt: drop.listenerPlaylistBuiltAt,
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
