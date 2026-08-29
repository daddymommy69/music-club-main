import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { submissions, type Club } from "@/db/schema";
import { getDropStatus } from "./dropStatus";

const OPEN_WINDOW_DAYS = 7;

export type SubmitContext = {
  isOpen: boolean;
  isManual: boolean;
  /** Days until submissions open again — same countdown as the next-drop hero, since opening happens at ship time. */
  daysUntilNext: number | null;
  nextDropNum: number;
  submissionCount: number;
};

/**
 * Submissions are open for one week after a drop ships, then closed
 * until the next one does. A club that hasn't shipped anything yet is
 * treated as open, so a brand-new club can start collecting picks for
 * its first drop from day one.
 */
export async function getSubmitContext(club: Club): Promise<SubmitContext> {
  const status = await getDropStatus(club);

  const isOpen = status.latestPublished
    ? Date.now() - status.latestPublished.publishedAt.getTime() < OPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000
    : true;

  const db = getDb();
  const [{ value: submissionCount }] = await db
    .select({ value: count() })
    .from(submissions)
    .where(and(eq(submissions.clubId, club.id), eq(submissions.dropNum, status.nextDropNum)));

  return {
    isOpen,
    isManual: status.isManual,
    daysUntilNext: status.daysUntilNext,
    nextDropNum: status.nextDropNum,
    submissionCount,
  };
}
