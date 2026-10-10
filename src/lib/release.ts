import { eq, desc, and, or, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { members, drops, type Drop } from "@/db/schema";
import { getDefaultClub } from "./club";
import { sendSms } from "./sms";
import { sendEmail } from "./email";
import { releaseSmsBody, releaseEmailHtml, top10ReleaseSmsBody, top10ReleaseEmailHtml } from "./messages";
import { generateMemberToken } from "./memberToken";

/**
 * The drop that hasn't shipped yet (or most recent one, if all have).
 *
 * Excludes canceled drops (2026-10-08 "drop control" round — see
 * claude/next-build.md): a canceled drop is closed off on purpose, so
 * it must never be mistaken for "the current drop" everywhere this
 * function feeds into (getOpenDrop, getDropStatus, the curator tools
 * panel, /submit, Browse's "drop open" check, etc.) — that's what lets
 * a curator start a fresh drop right after canceling one. The row and
 * its songs are kept forever either way; this is a visibility filter,
 * not a delete. Note: the *next drop number* is still computed from
 * the true highest num including canceled rows (see
 * /api/overview/start-drop) so a canceled drop's number is never
 * reused — this function answers "what's open," not "what's the
 * highest number that ever existed."
 */
export async function getCurrentDrop(): Promise<Drop | null> {
  const club = await getDefaultClub();
  const db = getDb();
  const rows = await db
    .select()
    .from(drops)
    .where(and(eq(drops.clubId, club.id), isNull(drops.canceledAt)))
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
export async function sendDropToSubscribers(drop: Drop, shippedBy?: string) {
  const db = getDb();
  const club = await getDefaultClub();

  if (!drop.appleUrl && !drop.spotifyUrl) {
    return { sent: 0, skipped: "no playlist link set for this drop" };
  }

  // Claim the ship atomically — set publishedAt now, before the send
  // loop, and only if it's still null (2026-10-08 audit fix — see
  // claude/next-build.md). Previously publishedAt was set only at the
  // very end, so a double-click on Ship, a retried request, or the
  // daily cron firing at the same moment a curator manually ships
  // could both pass the "is this drop still open" check and both run
  // the full send loop — every subscriber getting the release twice.
  // Only the request whose UPDATE actually flips publishedAt from null
  // gets to send; a second concurrent caller sees 0 rows affected and
  // backs off instead of sending again.
  //
  // Also requires canceledAt still null (2026-10-09 audit fix — the
  // mirror-image race: canceling a drop at the exact moment it ships
  // could previously leave it shipped even though a curator just
  // canceled it). /api/overview/cancel gained the matching guard
  // (publishedAt still null) in this same round, so whichever side's
  // claim lands first wins outright and the other backs off cleanly.
  const claimed = await db
    .update(drops)
    .set({ publishedAt: new Date(), ...(shippedBy ? { shippedBy } : {}) })
    .where(and(eq(drops.id, drop.id), isNull(drops.publishedAt), isNull(drops.canceledAt)))
    .returning();

  if (!claimed[0]) {
    return { sent: 0, skipped: "already shipped, or canceled just before it could ship" };
  }

  const active = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.clubId, club.id),
        eq(members.optedOut, false),
        or(eq(members.wantsText, true), eq(members.wantsEmail, true))
      )
    );

  let sent = 0;
  const errors: string[] = [];

  for (const sub of active) {
    try {
      // Members created before the /you page existed (or before the
      // unified account model) won't have a token yet — generate and
      // persist one now rather than skipping the personalized link
      // (self-healing backfill, no separate migration script needed
      // since every send passes through here).
      let memberToken = sub.memberToken;
      if (!memberToken) {
        memberToken = generateMemberToken();
        await db.update(members).set({ memberToken }).where(eq(members.id, sub.id));
      }

      if (sub.wantsText && sub.phone) {
        await sendSms(sub.phone, releaseSmsBody(drop, memberToken));
      }
      if (sub.wantsEmail && sub.email) {
        // Lowercase, no emoji — matches the welcome/curator emails'
        // subject style (2026-10-10 founder decision, see
        // claude/next-build.md). releaseEmailHtml no longer takes
        // memberToken — it links to the drop's own public page now,
        // not a personal /you link — memberToken is still generated
        // above for the SMS body just below, which is unchanged.
        await sendEmail(sub.email, "new playlist is here", releaseEmailHtml(drop));
      }
      sent += 1;
    } catch (err) {
      errors.push(`${sub.id}: ${(err as Error).message}`);
    }
  }

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
    .from(members)
    .where(
      and(
        eq(members.clubId, club.id),
        eq(members.optedOut, false),
        or(eq(members.wantsText, true), eq(members.wantsEmail, true))
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
