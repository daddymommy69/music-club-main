import { eq, desc, and, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subscribers, drops, type Drop } from "@/db/schema";
import { getDefaultClub } from "./club";
import { sendSms } from "./sms";
import { sendEmail } from "./email";
import { releaseSmsBody, releaseEmailHtml, top10ReleaseSmsBody, top10ReleaseEmailHtml } from "./messages";
import { generateYouToken } from "./subscriberToken";

/** The drop that hasn't shipped yet (or most recent one, if all have). */
export async function getCurrentDrop(): Promise<Drop | null> {
  const club = await getDefaultClub();
  const db = getDb();
  const rows = await db
    .select()
    .from(drops)
    .where(eq(drops.clubId, club.id))
    .orderBy(desc(drops.num))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Sends the given drop's playlist to every active, non-opted-out
 * subscriber over whichever channel(s) they picked. Returns a summary
 * so the caller (manual "send now" route or the cron route) can report
 * what happened.
 */
export async function sendDropToSubscribers(drop: Drop) {
  const db = getDb();
  const club = await getDefaultClub();

  if (!drop.appleUrl && !drop.spotifyUrl) {
    return { sent: 0, skipped: "no playlist link set for this drop" };
  }

  const active = await db
    .select()
    .from(subscribers)
    .where(
      and(
        eq(subscribers.clubId, club.id),
        eq(subscribers.optedOut, false),
        or(eq(subscribers.wantsText, true), eq(subscribers.wantsEmail, true))
      )
    );

  let sent = 0;
  const errors: string[] = [];

  for (const sub of active) {
    try {
      // Subscribers created before the /you page existed won't have a
      // token yet — generate and persist one now rather than skipping
      // the personalized link (self-healing backfill, no separate
      // migration script needed since every send passes through here).
      let youToken = sub.youToken;
      if (!youToken) {
        youToken = generateYouToken();
        await db.update(subscribers).set({ youToken }).where(eq(subscribers.id, sub.id));
      }

      if (sub.wantsText && sub.phone) {
        await sendSms(sub.phone, releaseSmsBody(drop, youToken));
      }
      if (sub.wantsEmail && sub.email) {
        await sendEmail(sub.email, "New playlist is here 🎵", releaseEmailHtml(drop, youToken));
      }
      sent += 1;
    } catch (err) {
      errors.push(`${sub.id}: ${(err as Error).message}`);
    }
  }

  await db.update(drops).set({ publishedAt: new Date() }).where(eq(drops.id, drop.id));

  return { sent, total: active.length, errors };
}

/**
 * Announces a drop's Subscriber Top 10 result once a curator pastes in
 * the playlist link (src/app/api/overview/top10/route.ts) — the "own
 * release message when it does go out" from the old Top 10 plan. Only
 * ever called once the 10-song threshold is hit (that's the only way a
 * playlist link exists to paste), so the "skip the release message on
 * very low turnout" case naturally never reaches this function at all —
 * no separate low-turnout check needed here.
 */
export async function sendTop10ToSubscribers(dropNum: number) {
  const db = getDb();
  const club = await getDefaultClub();

  const active = await db
    .select()
    .from(subscribers)
    .where(
      and(
        eq(subscribers.clubId, club.id),
        eq(subscribers.optedOut, false),
        or(eq(subscribers.wantsText, true), eq(subscribers.wantsEmail, true))
      )
    );

  let sent = 0;
  const errors: string[] = [];

  for (const sub of active) {
    try {
      if (sub.wantsText && sub.phone) {
        await sendSms(sub.phone, top10ReleaseSmsBody(dropNum));
      }
      if (sub.wantsEmail && sub.email) {
        await sendEmail(sub.email, "The Subscriber Top 10 is up 🎶", top10ReleaseEmailHtml(dropNum));
      }
      sent += 1;
    } catch (err) {
      errors.push(`${sub.id}: ${(err as Error).message}`);
    }
  }

  return { sent, total: active.length, errors };
}
