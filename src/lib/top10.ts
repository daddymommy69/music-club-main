import type { Drop } from "@/db/schema";

/**
 * Subscriber Top 10 — old plan.md Phase 3, confirmed still wanted,
 * built after design-handoff.md's nine screens (which don't cover it).
 *
 * The window is fully automatic and date-derived off a drop's ship
 * time (`publishedAt`) — no curator action opens or closes it, same
 * spirit as /submit's own open/closed window (src/lib/submit.ts).
 * Opens `GAP_HOURS` after ship, stays open for `WINDOW_DAYS`.
 */
export const GAP_HOURS = 12;
export const WINDOW_DAYS = 7;

/**
 * Founder decision when Top 10 was scoped: applies starting with the
 * next drop shipped, not retroactively — the already-shipped seed
 * drops (5, 6, 7) keep no Top 10 data. Since the window is otherwise
 * purely derived from `publishedAt`, without this cutoff those old
 * drops would suddenly show a "window" the moment this feature shipped
 * (their ship dates are well over 12 hours in the past). Anything
 * published before this ship date gets no window at all, regardless of
 * how long ago it was.
 */
export const TOP10_LAUNCHED_AT = new Date("2026-08-29T00:00:00Z");

/** Below this many unique songs, no playlist gets built — the result
 * still shows on the archive, just without a playlist link. */
export const PLAYLIST_THRESHOLD = 10;

/** Vote counts stay hidden until every entry shown has at least this
 * many votes — avoids the "ranked #1 with 1 vote" look. */
export const REVEAL_MIN_VOTES = 2;

export type Top10Window = { opensAt: Date; closesAt: Date };

/** null if the drop hasn't shipped yet, or shipped before Top 10 launched
 * (see TOP10_LAUNCHED_AT) — either way, there's no window to derive. */
export function getTop10Window(drop: Pick<Drop, "publishedAt">): Top10Window | null {
  if (!drop.publishedAt) return null;
  if (drop.publishedAt < TOP10_LAUNCHED_AT) return null;
  const opensAt = new Date(drop.publishedAt);
  opensAt.setHours(opensAt.getHours() + GAP_HOURS);
  const closesAt = new Date(opensAt);
  closesAt.setDate(closesAt.getDate() + WINDOW_DAYS);
  return { opensAt, closesAt };
}

export type Top10Phase = "not-shipped" | "pending" | "open" | "closed";

export function getTop10Phase(drop: Pick<Drop, "publishedAt">, now: Date = new Date()): Top10Phase {
  const window = getTop10Window(drop);
  if (!window) return "not-shipped";
  if (now < window.opensAt) return "pending";
  if (now < window.closesAt) return "open";
  return "closed";
}

export type Top10Vote = {
  title: string | null;
  artist: string | null;
  link: string;
  submittedAt: Date;
};

export type Top10TallyRow = {
  title: string | null;
  artist: string | null;
  /** One representative link for this song (whichever came in first). */
  link: string;
  votes: number;
  earliestAt: Date;
};

function sameSong(a: Top10Vote, b: Top10TallyRow): boolean {
  if (a.title && a.artist && b.title && b.artist) {
    return (
      a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
      a.artist.trim().toLowerCase() === b.artist.trim().toLowerCase()
    );
  }
  // Neither side has resolved metadata (Odesli lookup failed/unreachable)
  // — fall back to exact-link matching so an unresolved song can still
  // collect more than one vote instead of always counting as 1.
  return !a.title && !b.title && a.link.trim() === b.link.trim();
}

/**
 * Groups votes into one row per song (cross-platform: a Spotify link and
 * an Apple Music link for the same track count as the same song once
 * both are Odesli-resolved), sorted by vote count descending, ties
 * broken by whichever song's first vote came in earliest — matching the
 * old plan's "most-submitted songs win; ties broken by earliest
 * submission."
 */
export function tallyTop10(votes: Top10Vote[]): Top10TallyRow[] {
  const rows: Top10TallyRow[] = [];
  for (const vote of votes) {
    const match = rows.find((row) => sameSong(vote, row));
    if (match) {
      match.votes += 1;
      if (vote.submittedAt < match.earliestAt) match.earliestAt = vote.submittedAt;
    } else {
      rows.push({
        title: vote.title,
        artist: vote.artist,
        link: vote.link,
        votes: 1,
        earliestAt: vote.submittedAt,
      });
    }
  }
  rows.sort((a, b) => b.votes - a.votes || a.earliestAt.getTime() - b.earliestAt.getTime());
  return rows;
}

/** True once every row has cleared REVEAL_MIN_VOTES — an empty tally is never "revealed". */
export function shouldRevealVoteCounts(tally: Top10TallyRow[]): boolean {
  return tally.length > 0 && tally.every((row) => row.votes >= REVEAL_MIN_VOTES);
}

export function hitsPlaylistThreshold(tally: Top10TallyRow[]): boolean {
  return tally.length >= PLAYLIST_THRESHOLD;
}
