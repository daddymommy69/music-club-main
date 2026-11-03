import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  members,
  curatorAssignments,
  curatorAssignmentDropNums,
  type Club,
  type Member,
  type CuratorAssignment,
} from "@/db/schema";
import { sendEmail } from "./email";
import { CURATOR_GRANTED_SUBJECT, curatorGrantedEmailHtml } from "./messages";
import { getOpenDrop } from "./room";

/**
 * Scoped curator terms (2026-11-03 "Admin Tools" round — see
 * claude/next-build.md and src/db/schema.ts's curatorAssignments
 * comment for the full design). This file is the only thing that
 * writes curatorAssignments/curatorAssignmentDropNums, and the only
 * thing that writes members.isCurator/everCurator for a member who
 * goes through this system — the one standing exception is
 * members.ts's ensureFounderAccess, which sets isCurator directly for
 * the founder's own account with no assignment row behind it (that
 * access was never meant to expire).
 */

export type GrantParams =
  | { mode: "count"; count: number }
  | { mode: "date"; endDate: Date }
  | { mode: "drops"; dropNums: number[] }
  | { mode: "unlimited" };

/** What the Admin Tools roster shows for one member — their current
 * role plus, if they're an active curator right now, a plain-English
 * summary of what's left on their term(s). */
export type MemberRosterRow = {
  id: number;
  name: string | null;
  email: string | null;
  isCurator: boolean;
  everCurator: boolean;
  activeAssignments: {
    id: number;
    mode: CuratorAssignment["mode"];
    remainingCount: number | null;
    endDate: string | null;
    dropNums: number[]; // only for mode "drops" — unconsumed ones
  }[];
};

/**
 * Grants curator status for a defined stretch (or indefinitely, for
 * "unlimited"). Caller is responsible for the isAdmin check first, same
 * trust-the-input pattern as every other write helper in this app
 * (members.ts's setCuratorStatus used to say the same thing, which this
 * replaces).
 */
export async function grantCuratorAssignment(
  club: Club,
  member: Member,
  params: GrantParams,
  grantedBy: string | null
): Promise<CuratorAssignment> {
  const db = getDb();

  const [assignment] = await db
    .insert(curatorAssignments)
    .values({
      clubId: club.id,
      memberId: member.id,
      mode: params.mode,
      remainingCount: params.mode === "count" ? params.count : null,
      endDate: params.mode === "date" ? params.endDate : null,
      grantedBy,
    })
    .returning();

  if (params.mode === "drops" && params.dropNums.length > 0) {
    await db.insert(curatorAssignmentDropNums).values(
      params.dropNums.map((dropNum) => ({
        assignmentId: assignment.id,
        dropNum,
      }))
    );
  }

  const wasAlreadyCurator = member.isCurator;
  await db
    .update(members)
    .set({ isCurator: true, ...(member.everCurator ? {} : { everCurator: true }) })
    .where(eq(members.id, member.id));

  // Same "you're a chosen one" email every grant has always sent — only
  // on a fresh grant, not a member who was already an active curator
  // getting a second overlapping assignment (nothing changed for them
  // to be notified about).
  if (!wasAlreadyCurator && member.email) {
    try {
      await sendEmail(member.email, CURATOR_GRANTED_SUBJECT, curatorGrantedEmailHtml());
    } catch (err) {
      console.error("Curator-granted email failed (grant still applied):", err);
    }
  }

  return assignment;
}

/** Ends one assignment and, if that was the member's last active one,
 * drops their isCurator flag back to false. Shared by the manual
 * "End now" button and every auto-revert path below. */
async function endAssignment(assignmentId: number, reason: "drops_complete" | "date_passed" | "manual") {
  const db = getDb();

  const [ended] = await db
    .update(curatorAssignments)
    .set({ active: false, endedAt: new Date(), endedReason: reason })
    .where(and(eq(curatorAssignments.id, assignmentId), eq(curatorAssignments.active, true)))
    .returning();
  if (!ended) return; // already ended — e.g. a lost race between the ship hook and a manual End

  const stillActive = await db
    .select({ id: curatorAssignments.id })
    .from(curatorAssignments)
    .where(and(eq(curatorAssignments.memberId, ended.memberId), eq(curatorAssignments.active, true)))
    .limit(1);

  if (stillActive.length === 0) {
    await db.update(members).set({ isCurator: false }).where(eq(members.id, ended.memberId));
  }
}

/** Admin Tools' "End now" button — cuts a single assignment short
 * regardless of mode. */
export async function endCuratorAssignmentManual(assignmentId: number): Promise<void> {
  await endAssignment(assignmentId, "manual");
}

/**
 * Called once, right after a drop actually ships (src/lib/shipDrop.ts —
 * never for a skipped/lost-race ship, same guard that route already
 * uses for its own auto-open-next-drop step). Best-effort: the caller
 * wraps this in try/catch so a bug here can never block shipping
 * itself, same spirit as every sendEmail call in this app.
 */
export async function onDropShipped(club: Club, dropNum: number): Promise<void> {
  const db = getDb();

  const active = await db
    .select()
    .from(curatorAssignments)
    .where(and(eq(curatorAssignments.clubId, club.id), eq(curatorAssignments.active, true)));

  for (const a of active) {
    if (a.mode === "count") {
      const remaining = (a.remainingCount ?? 0) - 1;
      if (remaining <= 0) {
        await endAssignment(a.id, "drops_complete");
      } else {
        await db.update(curatorAssignments).set({ remainingCount: remaining }).where(eq(curatorAssignments.id, a.id));
      }
    } else if (a.mode === "drops") {
      const [consumed] = await db
        .update(curatorAssignmentDropNums)
        .set({ consumedAt: new Date() })
        .where(and(eq(curatorAssignmentDropNums.assignmentId, a.id), eq(curatorAssignmentDropNums.dropNum, dropNum)))
        .returning();
      if (!consumed) continue; // this drop's number wasn't one of theirs

      const [stillPending] = await db
        .select({ id: curatorAssignmentDropNums.id })
        .from(curatorAssignmentDropNums)
        .where(and(eq(curatorAssignmentDropNums.assignmentId, a.id), isNull(curatorAssignmentDropNums.consumedAt)))
        .limit(1);
      if (!stillPending) await endAssignment(a.id, "drops_complete");
    } else if (a.mode === "date") {
      // The drop that just shipped is, by definition, no longer open —
      // this is exactly the "wait for the open drop to finish" moment
      // for a date-mode grant whose date already passed.
      if (a.endDate && a.endDate <= new Date()) {
        await endAssignment(a.id, "date_passed");
      }
    }
    // "unlimited" never auto-ends.
  }
}

/**
 * Catches date-mode expirations a ship event wouldn't — the club's gone
 * quiet with nothing shipping, or the cycle is "manual" and nothing's
 * scheduled. Piggybacks on the existing daily cron (src/app/api/cron/
 * drops) rather than a separate schedule: the founder said monthly is
 * fine and doesn't need to be daily, but running it on the cron that
 * already fires daily is simpler than tracking a separate cadence, and
 * it's a no-op (nothing to end) on every day it's not actually due.
 */
export async function sweepExpiredDateAssignments(club: Club): Promise<void> {
  const db = getDb();
  const openDrop = await getOpenDrop(club);
  if (openDrop) return; // extend until the open drop is done, same as the ship-hook path

  const due = await db
    .select()
    .from(curatorAssignments)
    .where(and(eq(curatorAssignments.clubId, club.id), eq(curatorAssignments.active, true), eq(curatorAssignments.mode, "date")));

  const now = new Date();
  for (const a of due) {
    if (a.endDate && a.endDate <= now) await endAssignment(a.id, "date_passed");
  }
}

/** Every member in the club, for the Admin Tools roster — see
 * AdminToolsPanel.tsx. Active assignments are joined in per member so
 * the roster can show "3 drops left" / "until Dec 1" / "drops 9, 11
 * left" / "no end date" without a second round trip per row. */
export async function listMemberRoster(clubId: number): Promise<MemberRosterRow[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(members)
    .where(eq(members.clubId, clubId))
    .orderBy(asc(members.name), asc(members.email));

  const active = await db
    .select()
    .from(curatorAssignments)
    .where(and(eq(curatorAssignments.clubId, clubId), eq(curatorAssignments.active, true)))
    .orderBy(desc(curatorAssignments.createdAt));

  const dropsModeIds = active.filter((a) => a.mode === "drops").map((a) => a.id);
  const dropNumsByAssignment = new Map<number, number[]>();
  if (dropsModeIds.length > 0) {
    const dropNumRows = await db
      .select()
      .from(curatorAssignmentDropNums)
      .where(and(inArray(curatorAssignmentDropNums.assignmentId, dropsModeIds), isNull(curatorAssignmentDropNums.consumedAt)));
    for (const r of dropNumRows) {
      const list = dropNumsByAssignment.get(r.assignmentId) ?? [];
      list.push(r.dropNum);
      dropNumsByAssignment.set(r.assignmentId, list);
    }
  }

  const byMember = new Map<number, MemberRosterRow["activeAssignments"]>();
  for (const a of active) {
    const list = byMember.get(a.memberId) ?? [];
    list.push({
      id: a.id,
      mode: a.mode,
      remainingCount: a.remainingCount,
      endDate: a.endDate ? a.endDate.toISOString() : null,
      dropNums: (dropNumsByAssignment.get(a.id) ?? []).sort((x, y) => x - y),
    });
    byMember.set(a.memberId, list);
  }

  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    isCurator: m.isCurator,
    everCurator: m.everCurator,
    activeAssignments: byMember.get(m.id) ?? [],
  }));
}

/** Admin Tools' member picker — search by name or email, same
 * `ilike`-both-fields spirit as everywhere else in this app that
 * searches free text. Limited since it's an autocomplete dropdown, not
 * a full roster. */
export async function searchMembers(clubId: number, query: string): Promise<Member[]> {
  const db = getDb();
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  return db
    .select()
    .from(members)
    .where(and(eq(members.clubId, clubId), or(ilike(members.name, like), ilike(members.email, like))))
    .orderBy(asc(members.name))
    .limit(10);
}
