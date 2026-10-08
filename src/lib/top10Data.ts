import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drops, top10Entries, type Drop, type Top10Entry } from "@/db/schema";
import { isUniqueViolation } from "./normalize";
import {
  getTop10Phase,
  getTop10Window,
  tallyTop10,
  shouldRevealVoteCounts,
  hitsPlaylistThreshold,
  type Top10Phase,
  type Top10Window,
  type Top10TallyRow,
} from "./top10";

/** The drop a Top 10 window concerns — always the most recently
 * *published* drop for the club, same target /you always resolves to
 * (getLatestPublicDrop in archive.ts). There's normally only ever one
 * drop with a live-or-recent Top 10 window at a time; if a club's cycle
 * is fast enough for two windows to overlap, this intentionally only
 * surfaces the newest one on /you and /overview — the older one's
 * result still appears on its own /drop/:num page once closed. */
export async function getTargetDropForTop10(clubId: number): Promise<Drop | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.clubId, clubId), isNotNull(drops.publishedAt)))
    .orderBy(desc(drops.num))
    .limit(1);
  return row ?? null;
}

export type Top10Summary = {
  dropId: number;
  dropNum: number;
  phase: Top10Phase;
  window: Top10Window | null;
  tally: Top10TallyRow[];
  revealCounts: boolean;
  hitThreshold: boolean;
  spotifyUrl: string | null;
  appleUrl: string | null;
};

export async function getTop10Summary(drop: Drop): Promise<Top10Summary> {
  const db = getDb();
  const phase = getTop10Phase(drop);
  const window = getTop10Window(drop);

  const rows =
    phase === "not-shipped" || phase === "pending"
      ? []
      : await db.select().from(top10Entries).where(eq(top10Entries.dropId, drop.id));

  const tally = tallyTop10(
    rows.map((r) => ({ title: r.title, artist: r.artist, link: r.link, submittedAt: r.submittedAt }))
  );

  return {
    dropId: drop.id,
    dropNum: drop.num,
    phase,
    window,
    tally,
    revealCounts: shouldRevealVoteCounts(tally),
    hitThreshold: hitsPlaylistThreshold(tally),
    spotifyUrl: drop.top10SpotifyUrl,
    appleUrl: drop.top10AppleUrl,
  };
}

export async function getSubscriberTop10Pick(
  dropId: number,
  subscriberId: number
): Promise<Top10Entry | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(top10Entries)
    .where(and(eq(top10Entries.dropId, dropId), eq(top10Entries.subscriberId, subscriberId)))
    .limit(1);
  return row ?? null;
}

export type SubmitTop10Result =
  | { ok: true; entry: Top10Entry }
  | { ok: false; reason: "already-submitted" };

/**
 * Inserts a subscriber's one-and-only Top 10 pick. Unlike the main
 * /submit form and /room's picks, a second vote for the same song is
 * the entire point (that's how tallying works) — so there is
 * deliberately no duplicate-song check here, only the one-per-subscriber
 * guard, enforced by the table's real unique constraint so a double
 * click or a retried request can't create two rows for the same person.
 */
export async function submitTop10Pick(entry: {
  dropId: number;
  subscriberId: number;
  link: string;
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
}): Promise<SubmitTop10Result> {
  const db = getDb();
  try {
    const [created] = await db.insert(top10Entries).values(entry).returning();
    return { ok: true, entry: created };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, reason: "already-submitted" };
    }
    throw err;
  }
}

export type SetTop10LinksResult = { drop: Drop; isFirstLink: boolean };

/**
 * Sets the Top 10 playlist link(s), reporting whether this specific
 * call is the one that set the FIRST link ever for this drop's Top 10
 * — that's the caller's (src/app/api/overview/top10/route.ts) signal
 * to send the one-time announce. Done as one atomic, conditional
 * UPDATE rather than a separate "check then write" (2026-10-08 audit
 * fix — see claude/next-build.md): the old code read
 * `wasAlreadySet` *before* writing, so a double-click or two curators
 * both pasting a link within the same instant could both see "not set
 * yet" and both trigger the subscriber announce. Only the request
 * whose UPDATE actually flips both columns from null wins the claim;
 * everyone else's write still applies normally, just without a second
 * announce.
 */
export async function setTop10Links(
  dropId: number,
  changes: { spotifyUrl?: string | null; appleUrl?: string | null }
): Promise<SetTop10LinksResult> {
  const db = getDb();
  const changeSet = {
    ...(changes.spotifyUrl !== undefined ? { top10SpotifyUrl: changes.spotifyUrl } : {}),
    ...(changes.appleUrl !== undefined ? { top10AppleUrl: changes.appleUrl } : {}),
  };

  const claimed = await db
    .update(drops)
    .set(changeSet)
    .where(and(eq(drops.id, dropId), isNull(drops.top10SpotifyUrl), isNull(drops.top10AppleUrl)))
    .returning();

  if (claimed[0]) {
    return { drop: claimed[0], isFirstLink: true };
  }

  const [updated] = await db.update(drops).set(changeSet).where(eq(drops.id, dropId)).returning();
  return { drop: updated, isFirstLink: false };
}
