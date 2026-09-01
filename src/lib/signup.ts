import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subscribers, type Club } from "@/db/schema";
import { getDropStatus } from "./dropStatus";
import { siteDisplayPath } from "@/lib/site";

export type SignupContext = {
  latestPublishedDrop: { num: number; title: string | null; shareUrl: string } | null;
  subscriberCount: number;
  isManual: boolean;
  /** Days until the next drop ships. null = manual mode, or unknown (nothing currently building). */
  daysUntilNext: number | null;
  nextDropNum: number;
  cycleDays: number | null;
};

/** Everything the sign-up page needs, gathered in one place so the page component stays a simple render. */
export async function getSignupContext(club: Club): Promise<SignupContext> {
  const db = getDb();

  const [{ value: subscriberCount }] = await db
    .select({ value: count() })
    .from(subscribers)
    .where(and(eq(subscribers.clubId, club.id), eq(subscribers.optedOut, false)));

  const status = await getDropStatus(club);

  return {
    latestPublishedDrop: status.latestPublished
      ? {
          num: status.latestPublished.num,
          title: status.latestPublished.title,
          shareUrl: siteDisplayPath(`/drop/${status.latestPublished.num}`),
        }
      : null,
    subscriberCount,
    isManual: status.isManual,
    daysUntilNext: status.daysUntilNext,
    nextDropNum: status.nextDropNum,
    cycleDays: status.cycleDays,
  };
}
