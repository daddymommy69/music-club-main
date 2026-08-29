import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subscribers, type Subscriber } from "@/db/schema";

export async function getSubscriberByYouToken(token: string): Promise<Subscriber | null> {
  if (!token) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.youToken, token))
    .limit(1);
  return row ?? null;
}

/** "Stop texting me" on /you — same effect as replying STOP, minus the
 * phone-number matching (we already know exactly who this is via the
 * token), so it also works for email-only subscribers. */
export async function optOutSubscriber(id: number): Promise<void> {
  const db = getDb();
  await db.update(subscribers).set({ optedOut: true }).where(eq(subscribers.id, id));
}
