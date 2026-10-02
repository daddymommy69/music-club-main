import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clubs, type Club } from "@/db/schema";

const DEFAULT_CLUB_NAME = process.env.NEXT_PUBLIC_CLUB_NAME || "Project Music Club";
const DEFAULT_JOIN_CODE = process.env.CLUB_JOIN_CODE || "GOOBERZ-4821";

/**
 * Only one club launches — the multi-club screens (#/clubs, #/new) are
 * intentionally unbuilt for launch, per the design handoff. But every
 * table is club-scoped so nothing here is a global: this just looks up
 * that single hard-coded club, creating it on first run.
 *
 * No in-process cache here (an earlier version had a 30s TTL one): a
 * plain indexed lookup is cheap at this app's scale, and a cache like
 * that can't actually be made correct — #/settings needs a rename or
 * cycle change to update every countdown immediately, but Next.js
 * doesn't guarantee this module's state is shared across every route
 * (dev-mode compiles routes as separate bundles, and a real deployment
 * may run multiple instances/functions with no shared memory at all).
 * Building "immediate" on top of that would only have looked correct
 * in a single warm process during local testing.
 */
export async function getDefaultClub(): Promise<Club> {
  const db = getDb();
  const existing = await db.select().from(clubs).limit(1);
  if (existing[0]) {
    return existing[0];
  }
  const [created] = await db
    .insert(clubs)
    .values({
      name: DEFAULT_CLUB_NAME,
      joinCode: DEFAULT_JOIN_CODE,
      cycle: "every45",
    })
    .returning();
  return created;
}

/** #/settings' save path. */
export async function updateClub(
  id: number,
  changes: Partial<Pick<Club, "name" | "cycle" | "cycleCustomDays">>
): Promise<Club> {
  const db = getDb();
  const [updated] = await db.update(clubs).set(changes).where(eq(clubs.id, id)).returning();
  return updated;
}
