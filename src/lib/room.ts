import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  members,
  songs,
  curatorNotes,
  comments,
  type Club,
  type Member,
  type Drop,
} from "@/db/schema";
import { getDropStatus } from "./dropStatus";

export type RoomPick = {
  id: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
  sourceUrl: string | null;
  curatorId: number;
  createdAt: Date;
};

export type RoomCuratorColumn = {
  curator: Member;
  picks: RoomPick[];
  note: string;
  noteUpdatedAt: Date | null;
  lastActivity: Date | null;
};

export type RoomComment = {
  id: number;
  curatorId: number;
  curatorName: string;
  text: string;
  createdAt: Date;
};

export type RoomStreamItem =
  | { kind: "pick"; at: Date; curatorName: string; pick: RoomPick }
  | { kind: "note"; at: Date; curatorName: string; text: string };

export type RoomData = {
  drop: Drop;
  daysUntilNext: number | null;
  isManual: boolean;
  curators: RoomCuratorColumn[];
  comments: RoomComment[];
  stream: RoomStreamItem[];
};

/**
 * The drop currently being privately built — the highest-numbered drop
 * that hasn't shipped yet. Null if every drop has shipped (or none exist
 * yet) and nobody's started the next one — /room has nothing to show in
 * that case (starting a drop is still an admin-only action; there's no
 * curator-facing "start a drop" control yet).
 */
export async function getOpenDrop(club: Club): Promise<Drop | null> {
  const status = await getDropStatus(club);
  if (status.current && !status.current.publishedAt) return status.current;
  return null;
}

export async function getRoomData(club: Club, drop: Drop): Promise<RoomData> {
  const db = getDb();

  // Only members with isCurator — the old `curators` table only ever
  // held curators, so selecting from the unified `members` table without
  // this filter would pull in every subscriber too.
  const [curatorRows, songRows, noteRows, commentRows, status] = await Promise.all([
    db
      .select()
      .from(members)
      .where(and(eq(members.clubId, club.id), eq(members.isCurator, true)))
      .orderBy(asc(members.createdAt)),
    db
      .select()
      .from(songs)
      .where(eq(songs.dropId, drop.id))
      .orderBy(asc(songs.position), asc(songs.createdAt)),
    db.select().from(curatorNotes).where(eq(curatorNotes.dropId, drop.id)),
    db
      .select({
        id: comments.id,
        curatorId: comments.curatorId,
        curatorName: members.name,
        text: comments.text,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .innerJoin(members, eq(comments.curatorId, members.id))
      .where(and(eq(comments.clubId, club.id), eq(comments.dropNum, drop.num)))
      .orderBy(asc(comments.createdAt)),
    getDropStatus(club),
  ]);

  const noteByCuratorId = new Map(noteRows.map((n) => [n.curatorId, n]));
  const picksByCuratorId = new Map<number, RoomPick[]>();
  for (const s of songRows) {
    if (s.curatorId == null) continue; // not a room pick (no owner) — skip
    const pick: RoomPick = {
      id: s.id,
      title: s.title,
      artist: s.artist,
      artworkUrl: s.artworkUrl,
      sourceUrl: s.sourceUrl,
      curatorId: s.curatorId,
      createdAt: s.createdAt,
    };
    const list = picksByCuratorId.get(s.curatorId) ?? [];
    list.push(pick);
    picksByCuratorId.set(s.curatorId, list);
  }

  const curatorColumns: RoomCuratorColumn[] = curatorRows.map((c) => {
    const picks = picksByCuratorId.get(c.id) ?? [];
    const note = noteByCuratorId.get(c.id) ?? null;
    const activityDates = [...picks.map((p) => p.createdAt), ...(note ? [note.updatedAt] : [])];
    const lastActivity =
      activityDates.length > 0
        ? new Date(Math.max(...activityDates.map((d) => d.getTime())))
        : null;
    return {
      curator: c,
      picks,
      note: note?.text ?? "",
      noteUpdatedAt: note?.updatedAt ?? null,
      lastActivity,
    };
  });

  const stream: RoomStreamItem[] = [];
  for (const col of curatorColumns) {
    // members.name is nullable (unlike the old curators.name, which was
    // required) — coalesce so RoomStreamItem.curatorName stays a plain
    // string, same contract this page has always had.
    const curatorName = col.curator.name ?? "";
    for (const pick of col.picks) {
      stream.push({ kind: "pick", at: pick.createdAt, curatorName, pick });
    }
    if (col.note.trim()) {
      stream.push({
        kind: "note",
        at: col.noteUpdatedAt ?? col.curator.createdAt,
        curatorName,
        text: col.note,
      });
    }
  }
  stream.sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    drop,
    daysUntilNext: status.daysUntilNext,
    isManual: status.isManual,
    curators: curatorColumns,
    comments: commentRows.map((c) => ({ ...c, curatorName: c.curatorName ?? "" })),
    stream,
  };
}
