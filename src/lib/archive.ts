import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { drops, songs, curatorNotes, songNotes, members, top10Entries, type Drop } from "@/db/schema";
import { getTop10Phase } from "./top10";
import { getTop10Summary } from "./top10Data";
import { getLikeCounts } from "./songLikes";
import { getDropRatingSummary } from "./ratings";
import { getSongRatingSummaries, type SongRatingSummary } from "./songRatings";
import { getDropLikeCounts } from "./dropLikes";
import { getArtworkTrims } from "./artworkTrim";

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
  /** One entry per artworkUrls, same order — how much of that image is
   * a border baked into the file itself (src/lib/artworkTrim.ts), so
   * DropTile can zoom each quadrant in by the same amount regardless of
   * what the original photo looked like. 0 means "no detectable
   * border" (or detection hasn't resolved it yet). */
  artworkTrims: number[];
  /** True once this drop's Top 10 window has closed with at least one
   * vote — drives the small badge on its archive card. A closed window
   * with zero votes shows no badge (nothing to see). */
  hasTop10: boolean;
  /** How many Listener Picks this cycle has — drives the secondary
   * "Listener Pick playlist" card on the archive page (2026-10
   * release-page redesign — see claude/next-build.md). Zero means no
   * card is shown for this cycle at all. */
  listenerPickCount: number;
  /** The drop's own Apple Music link, straight off drops.appleUrl
   * (2026-10-27 round — added so the curator "Drop options" list can
   * show whether each shipped drop already has one set, see
   * MoreSection / CuratorToolsPanel.tsx). Not otherwise used by the
   * public archive page this function also powers. */
  appleUrl: string | null;
};

export async function getPublishedDrops(clubId: number): Promise<ArchiveDropSummary[]> {
  const db = getDb();

  const publishedDrops = await db
    .select({
      id: drops.id,
      num: drops.num,
      title: drops.title,
      publishedAt: drops.publishedAt,
      appleUrl: drops.appleUrl,
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

  // One batched lookup across every drop's artwork rather than one per
  // drop — getArtworkTrims already dedupes identical URLs itself.
  const allArtworkUrls = [...artworkByDropId.values()].flat();
  const trimsByUrl = await getArtworkTrims(allArtworkUrls);

  return publishedDrops.map((d) => {
    const artworkUrls = artworkByDropId.get(d.id) ?? [];
    return {
      id: d.id,
      num: d.num,
      title: d.title,
      // isNotNull filtered this above, so it's safe to assert non-null.
      publishedAt: d.publishedAt as Date,
      songCount: countByDropId.get(d.id) ?? 0,
      artworkUrls,
      artworkTrims: artworkUrls.map((u) => trimsByUrl.get(u) ?? 0),
      hasTop10: dropIdsWithVotes.has(d.id) && getTop10Phase({ publishedAt: d.publishedAt }) === "closed",
      listenerPickCount: listenerPickCountByDropId.get(d.id) ?? 0,
      appleUrl: d.appleUrl,
    };
  });
}

export type PublicSongRow = {
  id: number;
  title: string;
  artist: string;
  curatorCredit: string | null;
  /** The curator behind curatorCredit's own public-profile slug, or null
   * when they don't have one yet (see members.slug's nullability note in
   * db/schema.ts) — same "render as plain text, never a dead link"
   * fallback DropDetail's contributors list already uses. Meaningless
   * for a Listener Pick (curatorCredit is null there too; see
   * listenerCredit below instead). */
  curatorSlug: string | null;
  /** The Spotify/Apple Music link a curator pasted in — public, so it's
   * safe to expose (unlike submittedBy, see the anonymity rule above).
   * Used to build each track's embedded player. */
  sourceUrl: string | null;
  artworkUrl: string | null;
  /** Set only when the Spotify auto-build step found a confident match
   * (see songs.spotifyUri's own comment in db/schema.ts) — the release
   * page's play-on-click (2026-10-08 "drop control + playback" round,
   * see claude/next-build.md) needs the bare track id this resolves to
   * via src/lib/spotifyId.ts; null means "no play available," same
   * never-throw-just-degrade spirit as everywhere else this is used. */
  spotifyUri: string | null;
  /** How much of artworkUrl is a border baked into the file itself
   * (src/lib/artworkTrim.ts) — the hero DropTile on this drop's own
   * page zooms each quadrant in by this amount. 0 for no artwork or no
   * detectable border. */
  artworkTrim: number;
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
  /** Public average + count for this one song (2026-10-07 "Browse"
   * round — see claude/next-build.md) — same null-means-nobody's-rated-
   * it-yet contract as the whole-drop rating above. */
  rating: SongRatingSummary;
  /** Per-curator blurbs about this song (2026-10-16 — see
   * CuratorToolsPanel.tsx's NotesCard for the write side). Empty when
   * nobody's written one — same shape as the drop-level notes below,
   * one entry per curator who has. */
  notes: PublicCuratorNote[];
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
  /** Everyone who contributed at least one Curator Pick to this drop
   * (2026-10-19 — founder's own ask: "add contributing curators to the
   * drop, so people can see who contributed to it"). Scoped to Curator
   * Picks only, same as every other public curator-credit field on this
   * page — Listener Picks aren't included (founder: "i havent
   * implemented listener picks yet"). One entry per curator regardless
   * of how many songs they added, ordered by whoever's song was added
   * to the drop first. Applies to already-shipped drops too, not just
   * new ones — this is a pure read over existing songs.curatorId data,
   * no backfill required. */
  contributors: PublicContributor[];
};

export type PublicContributor = {
  name: string;
  slug: string | null;
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
      curatorId: songs.curatorId,
      sourceUrl: songs.sourceUrl,
      artworkUrl: songs.artworkUrl,
      spotifyUri: songs.spotifyUri,
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

  const [likeCounts, ratingSummary, dropLikeCounts, songRatingSummaries, artworkTrimsByUrl, songNoteRows, contributorRows] =
    await Promise.all([
      getLikeCounts(songRows.map((s) => s.id)),
      getDropRatingSummary(drop.id),
      getDropLikeCounts([drop.id]),
      getSongRatingSummaries(songRows.map((s) => s.id)),
      getArtworkTrims(songRows.map((s) => s.artworkUrl)),
      // Per-song blurbs (2026-10-16) — guarded the same way as the helpers
      // above implicitly are: a drop with no songs has nothing to query.
      songRows.length > 0
        ? db
            .select({ songId: songNotes.songId, curatorName: members.name, text: songNotes.text })
            .from(songNotes)
            .innerJoin(members, eq(songNotes.curatorId, members.id))
            .where(
              inArray(
                songNotes.songId,
                songRows.map((s) => s.id)
              )
            )
            // Oldest first (2026-10-16 "feed of posts" redesign — a
            // curator can post more than one of these now, and reads
            // naturally as a little journal in the order it was written).
            .orderBy(asc(songNotes.createdAt))
        : Promise.resolve([]),
      // Contributing curators (2026-10-19) — moved up here (was further
      // down this function) and now doubles as the source for each
      // song's own curatorSlug below (2026-10-26 round — see
      // claude/next-build.md: founder's own ask, "i like the link to be
      // clickable," for the per-song "picked by X" credit, same as the
      // curators: line above it already does). One row per curator who
      // has at least one Curator Pick on this drop — every curatorId a
      // song row could have, so no second query needed.
      db
        .select({
          id: members.id,
          name: members.name,
          slug: members.slug,
          firstAddedAt: sql<Date>`min(${songs.createdAt})`,
        })
        .from(songs)
        .innerJoin(members, eq(songs.curatorId, members.id))
        .where(and(eq(songs.dropId, drop.id), eq(songs.pickType, "curator")))
        .groupBy(members.id, members.name, members.slug)
        .orderBy(asc(sql`min(${songs.createdAt})`)),
    ]);

  const songNotesBySongId = new Map<number, PublicCuratorNote[]>();
  for (const row of songNoteRows) {
    const list = songNotesBySongId.get(row.songId) ?? [];
    list.push({ curatorName: row.curatorName ?? "", text: row.text });
    songNotesBySongId.set(row.songId, list);
  }

  const slugByCuratorId = new Map(contributorRows.map((row) => [row.id, row.slug]));

  const publicSongs: PublicSongRow[] = songRows.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    curatorCredit: s.curatorCredit,
    curatorSlug: s.curatorId ? slugByCuratorId.get(s.curatorId) ?? null : null,
    sourceUrl: s.sourceUrl,
    artworkUrl: s.artworkUrl,
    artworkTrim: s.artworkUrl ? artworkTrimsByUrl.get(s.artworkUrl) ?? 0 : 0,
    spotifyUri: s.spotifyUri,
    pickType: s.pickType,
    listenerCredit: s.pickType === "listener" ? s.listenerName ?? null : null,
    listenerIsCurator: s.pickType === "listener" ? s.listenerIsCurator ?? false : false,
    likeCount: likeCounts.get(s.id) ?? 0,
    rating: songRatingSummaries.get(s.id) ?? { average: null, count: 0 },
    notes: songNotesBySongId.get(s.id) ?? [],
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
      .orderBy(asc(curatorNotes.createdAt))
  ).map((row) => ({ curatorName: row.curatorName ?? "", text: row.text }));

  // Contributing curators (2026-10-19) — one row per curator who has at
  // least one Curator Pick on this drop, ordered by whoever's song was
  // added first. curatorId is nullable (an unclaimed subscriber
  // submission a curator pulled in with no owner attached) — the inner
  // join on members naturally excludes those rows, same as it would if
  // this were filtered with isNotNull(songs.curatorId) explicitly.
  // (Query itself now lives up in the Promise.all above, 2026-10-26 —
  // also where each song's own curatorSlug comes from.)
  const contributors: PublicContributor[] = contributorRows.map((row) => ({
    name: row.name?.trim() || "a curator",
    slug: row.slug,
  }));

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
    contributors,
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

export type PublicStats = {
  dropCount: number;
  songCount: number;
  artistCount: number;
};

/**
 * Headline numbers for the About page (2026-10-13 — founder's own ask,
 * see claude/next-build.md). Deliberately scoped to match what a
 * visitor can actually click into and listen to: only published drops,
 * and only their official curator-picked tracks — a Listener Pick or
 * Top 10 vote never became part of the drop's own shipped playlist, so
 * it's left out of "songs" here even though it appears elsewhere on
 * the site. artistCount is normalized (trimmed + lowercased) before
 * counting distinct values so "Drake" and "drake " don't inflate the
 * count as two different artists.
 */
export async function getPublicStats(clubId: number): Promise<PublicStats> {
  const db = getDb();

  const publishedDropIds = await db
    .select({ id: drops.id })
    .from(drops)
    .where(and(eq(drops.clubId, clubId), isNotNull(drops.publishedAt)));

  if (publishedDropIds.length === 0) {
    return { dropCount: 0, songCount: 0, artistCount: 0 };
  }

  const dropIds = publishedDropIds.map((d) => d.id);
  const songRows = await db
    .select({ artist: songs.artist })
    .from(songs)
    .where(and(inArray(songs.dropId, dropIds), eq(songs.pickType, "curator")));

  const artistSet = new Set(songRows.map((s) => s.artist.trim().toLowerCase()));

  return {
    dropCount: dropIds.length,
    songCount: songRows.length,
    artistCount: artistSet.size,
  };
}

export type DropMissingPlaylist = { num: number; title: string | null };

/**
 * Shipped drops with no Spotify playlist attached yet — drives the
 * curator-facing "Build Spotify playlist" button (2026-10-15 — founder's
 * own ask: a reusable UI for what the one-off /api/admin/spotify-backfill
 * route used to need a curl command for). Normally just drop 1, which
 * shipped before the auto-build existed, but this stays general so any
 * drop that ships without one (Spotify disconnected at the time, build
 * failed, etc.) gets the same fix-it path rather than being stuck.
 */
export async function getDropsMissingPlaylist(clubId: number): Promise<DropMissingPlaylist[]> {
  const db = getDb();
  return db
    .select({ num: drops.num, title: drops.title })
    .from(drops)
    .where(and(eq(drops.clubId, clubId), isNotNull(drops.publishedAt), isNull(drops.spotifyUrl)))
    .orderBy(asc(drops.num));
}

export type { Drop };
