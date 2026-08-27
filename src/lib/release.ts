import { eq, desc, and, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subscribers, cycles, type Cycle } from "@/db/schema";
import { sendSms } from "./sms";
import { sendEmail } from "./email";
import { releaseSmsBody, releaseEmailHtml } from "./messages";

/** The cycle that hasn't gone out yet (or most recent one, if all are sent). */
export async function getCurrentCycle(): Promise<Cycle | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(cycles)
    .orderBy(desc(cycles.cycleNumber))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Sends the given cycle's playlist to every active, non-opted-out
 * subscriber over whichever channel(s) they picked. Returns a summary
 * so the caller (manual "send now" route or the cron route) can report
 * what happened.
 */
export async function sendCycleToSubscribers(cycle: Cycle) {
  const db = getDb();

  if (!cycle.appleMusicUrl && !cycle.spotifyUrl) {
    return { sent: 0, skipped: "no playlist link set for this cycle" };
  }

  const active = await db
    .select()
    .from(subscribers)
    .where(
      and(
        eq(subscribers.optedOut, false),
        or(eq(subscribers.wantsText, true), eq(subscribers.wantsEmail, true))
      )
    );

  let sent = 0;
  const errors: string[] = [];

  for (const sub of active) {
    try {
      if (sub.wantsText && sub.phone) {
        await sendSms(sub.phone, releaseSmsBody(cycle));
      }
      if (sub.wantsEmail && sub.email) {
        await sendEmail(
          sub.email,
          "New playlist is here 🎵",
          releaseEmailHtml(cycle)
        );
      }
      sent += 1;
    } catch (err) {
      errors.push(`${sub.id}: ${(err as Error).message}`);
    }
  }

  await db
    .update(cycles)
    .set({ sentAt: new Date() })
    .where(eq(cycles.id, cycle.id));

  return { sent, total: active.length, errors };
}
