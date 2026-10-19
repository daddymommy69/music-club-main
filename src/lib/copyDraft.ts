import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { copyDrafts } from "@/db/schema";

/**
 * Read/write for the admin copy editor's "Save" button (2026-10-19 —
 * see src/db/schema.ts's copyDrafts comment for why this never touches
 * the live site). One row per club, upserted in place — there's only
 * ever one admin's one in-progress draft, so there's nothing to version
 * or key further than that.
 */

export async function getCopyDraft(clubId: number): Promise<Record<string, string> | null> {
  const db = getDb();
  const [row] = await db.select().from(copyDrafts).where(eq(copyDrafts.clubId, clubId)).limit(1);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.data);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    return null;
  } catch {
    return null;
  }
}

export async function saveCopyDraft(clubId: number, values: Record<string, string>): Promise<void> {
  const db = getDb();
  const data = JSON.stringify(values);

  // Select-then-update-or-insert, same upsert pattern as
  // src/lib/ratings.ts's setDropRating — one row per club, so there's
  // never a race worth a real ON CONFLICT clause here.
  const [existing] = await db
    .select({ id: copyDrafts.id })
    .from(copyDrafts)
    .where(eq(copyDrafts.clubId, clubId))
    .limit(1);

  if (existing) {
    await db.update(copyDrafts).set({ data, updatedAt: new Date() }).where(eq(copyDrafts.id, existing.id));
  } else {
    await db.insert(copyDrafts).values({ clubId, data });
  }
}
