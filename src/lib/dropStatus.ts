import type { Club, Drop } from "@/db/schema";
import { getCurrentDrop } from "./release";
import { getPublishedDrops, type ArchiveDropSummary } from "./archive";
import { getCycleDays } from "./cycle";

export type DropStatus = {
  current: Drop | null;
  latestPublished: ArchiveDropSummary | null;
  isManual: boolean;
  cycleDays: number | null;
  /** Days until the next drop ships. null = manual mode, or unknown (nothing currently building). */
  daysUntilNext: number | null;
  nextDropNum: number;
};

/**
 * Shared cycle/countdown math — used by both the sign-up page (hero
 * countdown) and the submit page (closed-state countdown), so the
 * number shown never disagrees between screens or with when the cron
 * route actually ships the drop.
 */
export async function getDropStatus(club: Club): Promise<DropStatus> {
  const published = await getPublishedDrops(club.id);
  const latestPublished = published[0] ?? null;
  const current = await getCurrentDrop();
  const isManual = club.cycle === "manual";
  const cycleDays = getCycleDays(club);

  let daysUntilNext: number | null = null;
  if (!isManual && cycleDays && current && !current.publishedAt) {
    const dueAt = new Date(current.createdAt);
    dueAt.setDate(dueAt.getDate() + cycleDays);
    const msLeft = dueAt.getTime() - Date.now();
    daysUntilNext = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  }

  const nextDropNum = current?.num ?? (latestPublished ? latestPublished.num + 1 : 1);

  return { current, latestPublished, isManual, cycleDays, daysUntilNext, nextDropNum };
}
