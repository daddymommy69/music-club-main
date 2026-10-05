import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs, drops, members } from "@/db/schema";

/** /account's profile-bio edit (2026-10 "next build" decision — see claude/next-build.md). Blank clears it back to null rather than storing an empty string. */
export async function updateMemberBio(memberId: number, bio: string): Promise<void> {
  const db = getDb();
  await db
    .update(members)
    .set({ bio: bio.trim() || null })
    .where(eq(members.id, memberId));
}

export type MemberSubmissionHistoryRow = {
  songId: number;
  title: string;
  artist: string;
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
