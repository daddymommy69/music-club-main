import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { songs, type Song } from "@/db/schema";
import { isUniqueViolation } from "./normalize";

/**
 * Listener Picks (2026-10 "next build" decision — see
 * claude/next-build.md): any signed-up member can submit one song per
 * open drop, straight into `songs` with no curator quick-add step.
 * "One per drop" is backed by a real partial unique index
 * (`songs_one_listener_pick_per_drop` in src/db/schema.ts), not just
 * the app-level check below — same belt-and-suspenders pattern as
 * Subscriber Top 10's one-pick-per-drop guard.
 */

export type ListenerPickInput = {
  dropId: number;
  memberId: number;
  link: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

/** The signed-in member's own Listener Pick for this drop, or null if they haven't submitted one yet. */
export async function getListenerPick(dropId: number, memberId: number): Promise<Song | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(songs)
    .where(
      and(
        eq(songs.dropId, dropId),
        eq(songs.submittedByMemberId, memberId),
        eq(songs.pickType, "listener")
      )
    )
    .limit(1);
  return row ?? null;
}

export type SubmitListenerPickResult =
  | { ok: true; song: Song }
  | { ok: false; reason: "already-submitted" };

export async function submitListenerPick(input: ListenerPickInput): Promise<SubmitListenerPickResult> {
  const db = getDb();
  try {
    const [created] = await db
      .insert(songs)
      .values({
        dropId: input.dropId,
        title: input.title,
        artist: input.artist,
        sourceUrl: input.link,
        artworkUrl: input.artworkUrl,
        pickType: "listener",
        submittedByMemberId: input.memberId,
        // No curatorCredit/curatorId — a Listener Pick's public credit
        // comes from submittedByMemberId (see DropDetail.tsx), not this
        // column, which stays reserved for curator-championed tracks.
      })
      .returning();
    return { ok: true, song: created };
  } catch (err) {
    // Lost a race with a second submit attempt (double-click, retried
    // request) — the partial unique index caught it, same recovery
    // pattern as Top 10's one-pick guard (src/lib/top10Data.ts).
    if (isUniqueViolation(err)) {
      return { ok: false, reason: "already-submitted" };
    }
    throw err;
  }
}

/** Edits the member's existing Listener Pick for this drop. Null if they don't have one to edit. */
export async function editListenerPick(
  dropId: number,
  memberId: number,
  changes: { link: string; title: string; artist: string; artworkUrl: string | null }
): Promise<Song | null> {
  const db = getDb();
  const [updated] = await db
    .update(songs)
    .set({
      title: changes.title,
      artist: changes.artist,
      sourceUrl: changes.link,
      artworkUrl: changes.artworkUrl,
    })
    .where(
      and(
        eq(songs.dropId, dropId),
        eq(songs.submittedByMemberId, memberId),
        eq(songs.pickType, "listener")
      )
    )
    .returning();
  return updated ?? null;
}

/** Withdraws (deletes) the member's Listener Pick for this drop. Returns false if they had none. */
export async function withdrawListenerPick(dropId: number, memberId: number): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(songs)
    .where(
      and(
        eq(songs.dropId, dropId),
        eq(songs.submittedByMemberId, memberId),
        eq(songs.pickType, "listener")
      )
    )
    .returning({ id: songs.id });
  return deleted.length > 0;
}
