import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs, drops, members } from "@/db/schema";

/**
 * /account's profile editor (2026-10 "next build" decision; extended
 * 2026-10-07 to also cover the member's own name — see
 * claude/next-build.md: name had no edit path anywhere before this,
 * it was only ever set once at signup). Blank clears either field back
 * to null rather than storing an empty string, same as bio always did.
 * No validation beyond trimming — the founder explicitly asked for no
 * guardrails here.
 */
export async function updateMemberProfile(
  memberId: number,
  changes: { name?: string; bio?: string }
): Promise<void> {
  const db = getDb();
  const set: { name?: string | null; bio?: string | null } = {};
  if (changes.name !== undefined) set.name = changes.name.trim() || null;
  if (changes.bio !== undefined) set.bio = changes.bio.trim() || null;
  if (Object.keys(set).length === 0) return;
  await db.update(members).set(set).where(eq(members.id, memberId));
}

export type MemberSubmissionHistoryRow = {
  songId: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUri: string | null;
  pickType: "curator" | "listener";
  dropNum: number;
  dropTitle: string | null;
  /** null = the drop this pick is on hasn't shipped yet (still private). */
  publishedAt: Date | null;
};

/**
 * A member's own submission history across every drop, newest first —
 * their Curator Picks (songs they own via curatorId) and/or Listener
 * Picks (songs they own via submittedByMemberId), combined. Used by
 * /account's "your picks" section.
 */
export async function getMemberSubmissionHistory(memberId: number): Promise<MemberSubmissionHistoryRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      songId: songs.id,
      title: songs.title,
      artist: songs.artist,
      artworkUrl: songs.artworkUrl,
      spotifyUri: songs.spotifyUri,
      pickType: songs.pickType,
      dropNum: drops.num,
      dropTitle: drops.title,
      publishedAt: drops.publishedAt,
    })
    .from(songs)
    .innerJoin(drops, eq(songs.dropId, drops.id))
    .where(
      or(
        and(eq(songs.pickType, "curator"), eq(songs.curatorId, memberId)),
        and(eq(songs.pickType, "listener"), eq(songs.submittedByMemberId, memberId))
      )
    )
    .orderBy(desc(drops.num));

  return rows;
}
