import { eq, and, asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { curatorNotes, songNotes, members, songs } from "@/db/schema";

export type NoteRow = {
  id: number;
  curatorId: number;
  curatorName: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Every curator's "about this drop" posts for one drop, oldest first
 * (2026-10-16 "feed of posts" redesign — see CuratorToolsPanel.tsx's
 * BlurbFeed). curatorNotes itself isn't new — it's always had this
 * exact read+public-display path (see src/lib/archive.ts,
 * src/lib/room.ts) — this just also hands back id/createdAt/updatedAt,
 * which the feed UI needs to tell posts apart, show "edited," and let
 * the viewer edit/delete their own.
 */
export async function getDropNotes(dropId: number): Promise<NoteRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: curatorNotes.id,
      curatorId: curatorNotes.curatorId,
      curatorName: members.name,
      text: curatorNotes.text,
      createdAt: curatorNotes.createdAt,
      updatedAt: curatorNotes.updatedAt,
    })
    .from(curatorNotes)
    .innerJoin(members, eq(curatorNotes.curatorId, members.id))
    .where(eq(curatorNotes.dropId, dropId))
    .orderBy(asc(curatorNotes.createdAt));
  return rows.map((r) => ({ ...r, curatorName: r.curatorName ?? "" }));
}

/**
 * Every curator's per-song posts for every song in one drop, grouped by
 * songId, each group oldest first. Same shape/spirit as getDropNotes
 * above, just joined through songs so a single query covers the whole
 * drop instead of one per song.
 */
export async function getSongNotesForDrop(dropId: number): Promise<Record<number, NoteRow[]>> {
  const db = getDb();
  const rows = await db
    .select({
      songId: songNotes.songId,
      id: songNotes.id,
      curatorId: songNotes.curatorId,
      curatorName: members.name,
      text: songNotes.text,
      createdAt: songNotes.createdAt,
      updatedAt: songNotes.updatedAt,
    })
    .from(songNotes)
    .innerJoin(members, eq(songNotes.curatorId, members.id))
    .innerJoin(songs, eq(songNotes.songId, songs.id))
    .where(eq(songs.dropId, dropId))
    .orderBy(asc(songNotes.createdAt));

  const bySong: Record<number, NoteRow[]> = {};
  for (const row of rows) {
    const list = bySong[row.songId] ?? (bySong[row.songId] = []);
    list.push({
      id: row.id,
      curatorId: row.curatorId,
      curatorName: row.curatorName ?? "",
      text: row.text,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
  return bySong;
}

/**
 * Write path for both blurb types (2026-10-16 "feed of posts" redesign
 * — founder's own ask: "it saves as a post under the blurb, which then
 * only the person who wrote can go back and edit"). No more upsert —
 * create always inserts a brand-new post (curator_notes/song_notes no
 * longer have a one-row-per-curator uniqueness, see schema.ts), and
 * update/delete both re-check curatorId ownership right in the WHERE
 * clause, not just at the API layer, so a post can only ever be
 * changed or removed by whoever actually wrote it. update/delete
 * return whether a row actually matched, so the API route can tell a
 * real edit apart from "that post isn't yours (or doesn't exist)."
 */
export async function createDropNote(dropId: number, curatorId: number, text: string): Promise<void> {
  const db = getDb();
  await db.insert(curatorNotes).values({ dropId, curatorId, text });
}

export async function updateDropNote(id: number, curatorId: number, text: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(curatorNotes)
    .set({ text, updatedAt: new Date() })
    .where(and(eq(curatorNotes.id, id), eq(curatorNotes.curatorId, curatorId)))
    .returning({ id: curatorNotes.id });
  return rows.length > 0;
}

export async function deleteDropNote(id: number, curatorId: number): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(curatorNotes)
    .where(and(eq(curatorNotes.id, id), eq(curatorNotes.curatorId, curatorId)))
    .returning({ id: curatorNotes.id });
  return rows.length > 0;
}

export async function createSongNote(songId: number, curatorId: number, text: string): Promise<void> {
  const db = getDb();
  await db.insert(songNotes).values({ songId, curatorId, text });
}

export async function updateSongNote(id: number, curatorId: number, text: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(songNotes)
    .set({ text, updatedAt: new Date() })
    .where(and(eq(songNotes.id, id), eq(songNotes.curatorId, curatorId)))
    .returning({ id: songNotes.id });
  return rows.length > 0;
}

export async function deleteSongNote(id: number, curatorId: number): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(songNotes)
    .where(and(eq(songNotes.id, id), eq(songNotes.curatorId, curatorId)))
    .returning({ id: songNotes.id });
  return rows.length > 0;
}
