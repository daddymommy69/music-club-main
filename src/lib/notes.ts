import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { curatorNotes, songNotes, members, songs } from "@/db/schema";

export type NoteRow = {
  curatorId: number;
  curatorName: string;
  text: string;
};

/**
 * Every curator's "about this drop" blurb for one drop (2026-10-16 —
 * see CuratorToolsPanel.tsx's NotesCard). curatorNotes itself isn't
 * new — it's always had this exact read+public-display path (see
 * src/lib/archive.ts, src/lib/room.ts) — this is just the first helper
 * that also hands back curatorId, which the curator-tools UI needs to
 * tell "my own blurb" apart from everyone else's.
 */
export async function getDropNotes(dropId: number): Promise<NoteRow[]> {
  const db = getDb();
  const rows = await db
    .select({ curatorId: curatorNotes.curatorId, curatorName: members.name, text: curatorNotes.text })
    .from(curatorNotes)
    .innerJoin(members, eq(curatorNotes.curatorId, members.id))
    .where(eq(curatorNotes.dropId, dropId));
  return rows.map((r) => ({ curatorId: r.curatorId, curatorName: r.curatorName ?? "", text: r.text }));
}

/**
 * Every curator's per-song blurb for every song in one drop, grouped by
 * songId (2026-10-16). Same shape/spirit as getDropNotes above, just
 * joined through songs so a single query covers the whole drop instead
 * of one per song.
 */
export async function getSongNotesForDrop(dropId: number): Promise<Record<number, NoteRow[]>> {
  const db = getDb();
  const rows = await db
    .select({
      songId: songNotes.songId,
      curatorId: songNotes.curatorId,
      curatorName: members.name,
      text: songNotes.text,
    })
    .from(songNotes)
    .innerJoin(members, eq(songNotes.curatorId, members.id))
    .innerJoin(songs, eq(songNotes.songId, songs.id))
    .where(eq(songs.dropId, dropId));

  const bySong: Record<number, NoteRow[]> = {};
  for (const row of rows) {
    const list = bySong[row.songId] ?? (bySong[row.songId] = []);
    list.push({ curatorId: row.curatorId, curatorName: row.curatorName ?? "", text: row.text });
  }
  return bySong;
}

/**
 * Write path for both blurb types below — each just upserts its own
 * curator's row by the table's own unique(dropId/songId, curatorId)
 * constraint, same "any current curator, own row, keep it or clear it"
 * pattern. Saving blank text deletes the row instead of leaving an
 * empty blurb behind with someone's name still attached to it.
 */
export async function upsertDropNote(dropId: number, curatorId: number, text: string): Promise<void> {
  const db = getDb();
  const trimmed = text.trim();
  if (!trimmed) {
    await db
      .delete(curatorNotes)
      .where(and(eq(curatorNotes.dropId, dropId), eq(curatorNotes.curatorId, curatorId)));
    return;
  }
  await db
    .insert(curatorNotes)
    .values({ dropId, curatorId, text: trimmed })
    .onConflictDoUpdate({
      target: [curatorNotes.dropId, curatorNotes.curatorId],
      set: { text: trimmed, updatedAt: new Date() },
    });
}

export async function upsertSongNote(songId: number, curatorId: number, text: string): Promise<void> {
  const db = getDb();
  const trimmed = text.trim();
  if (!trimmed) {
    await db.delete(songNotes).where(and(eq(songNotes.songId, songId), eq(songNotes.curatorId, curatorId)));
    return;
  }
  await db
    .insert(songNotes)
    .values({ songId, curatorId, text: trimmed })
    .onConflictDoUpdate({
      target: [songNotes.songId, songNotes.curatorId],
      set: { text: trimmed, updatedAt: new Date() },
    });
}
