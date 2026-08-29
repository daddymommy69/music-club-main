import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subscribers, submissions, type Club } from "@/db/schema";
import { normalizePhone, isUniqueViolation } from "@/lib/normalize";
import { isValidMusicLink } from "@/lib/musicLink";
import { resolveSongMetadata } from "@/lib/odesli";
import { getSubmitContext } from "@/lib/submit";
import { generateYouToken } from "@/lib/subscriberToken";
import {
  smsSubmitNoLinkBody,
  smsSubmitClosedBody,
  smsSubmitConfirmationBody,
  smsSubmitWelcomeAndConfirmationBody,
} from "@/lib/messages";

/**
 * SMS text-in — old plan.md Phase 1, confirmed still wanted, built after
 * Top 10. Founder decisions locked in before building (see plan.md):
 *   - Subscriber text-in only — no group-chat/bot number for curators,
 *     that stays a separate, unscoped future idea.
 *   - Same open/closed window as /submit (a drop's 7-day post-ship
 *     window) — reuses getSubmitContext so the two channels can never
 *     disagree about whether submissions are open.
 *   - Anyone can text in, not just known subscribers. An unrecognized
 *     number is auto-subscribed on the spot rather than asked for a
 *     name over a second text — consent to text back (and to future
 *     release texts) is implied by them texting the club's own number
 *     first, the same reasoning that already lets STOP/START work with
 *     no signup checkbox. A known subscriber who previously texted STOP
 *     is left opted-out either way — this function only ever inserts a
 *     new subscriber row for a genuinely new number, never flips
 *     optedOut back on an existing one.
 *   - No duplicate-song warning over SMS (unlike /submit's "already in —
 *     add it anyway?" card) — there's no button to tap in a text thread,
 *     so a repeat pick is just accepted, same as it would be if two
 *     different people happened to submit the same song.
 *   - No length limit here either — a submitted link is just a link, this
 *     doesn't touch the no-length-cap decision on notes/comments.
 */

/** Pulls the first http(s) URL out of a text message body. Unlike the web
 * form's paste-only field, people texting a link often add a bit of
 * commentary around it ("check this out https://..."), so this can't
 * just validate the whole message the way isValidMusicLink(rawBody)
 * would. Trailing punctuation a phone keyboard tends to auto-add
 * ("...spotify.com/track/abc.") is stripped off the end. */
export function extractLink(body: string): string | null {
  const match = body.match(/https?:\/\/\S+/i);
  if (!match) return null;
  return match[0].replace(/[.,!?)>\]]+$/, "");
}

function last4Digits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4) || "????";
}

/**
 * Handles one inbound text that isn't STOP/START (route.ts branches those
 * off before calling this). Always returns the reply body to send back —
 * never throws for a bad/ambiguous input, only for a real server error.
 */
export async function handleInboundSongText(
  club: Club,
  from: string,
  rawBody: string
): Promise<string> {
  const link = extractLink(rawBody);
  if (!link || !isValidMusicLink(link)) {
    return smsSubmitNoLinkBody();
  }

  const status = await getSubmitContext(club);
  if (!status.isOpen) {
    return smsSubmitClosedBody(status.daysUntilNext, status.isManual);
  }

  const db = getDb();
  const phoneKey = normalizePhone(from);

  const [existingSubscriber] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.clubId, club.id), eq(subscribers.phoneKey, phoneKey)))
    .limit(1);

  let subscriber = existingSubscriber ?? null;
  let justSubscribed = false;

  if (!subscriber) {
    try {
      const [created] = await db
        .insert(subscribers)
        .values({
          clubId: club.id,
          phone: from,
          phoneKey,
          wantsText: true,
          smsConsent: true,
          smsOptInAt: new Date(),
          youToken: generateYouToken(),
        })
        .returning();
      subscriber = created;
      justSubscribed = true;
    } catch (err) {
      // Lost a race with another text from the same number landing at
      // nearly the same moment — same recovery as /api/subscribe.
      if (!isUniqueViolation(err)) throw err;
      const [dupe] = await db
        .select()
        .from(subscribers)
        .where(and(eq(subscribers.clubId, club.id), eq(subscribers.phoneKey, phoneKey)))
        .limit(1);
      subscriber = dupe ?? null;
    }
  }

  // Visible to curators on /overview's pile, same as any other
  // submittedBy value — never a public field. A name on file wins; a
  // brand-new or nameless number falls back to a phone-based label so
  // curators still have *something* to dedupe/spot-abuse against.
  const displayName = subscriber?.name?.trim() || `Text ending in ${last4Digits(from)}`;

  // Best-effort metadata lookup, same as /submit — never blocks the
  // submission on failure.
  const metadata = await resolveSongMetadata(link);

  // No duplicate check here by design (see file header) — every text
  // that makes it this far gets recorded.
  await db.insert(submissions).values({
    clubId: club.id,
    dropNum: status.nextDropNum,
    link,
    title: metadata?.title ?? null,
    artist: metadata?.artist ?? null,
    artworkUrl: metadata?.artworkUrl ?? null,
    submittedBy: displayName,
  });

  const countSoFar = status.submissionCount + 1;

  return justSubscribed
    ? smsSubmitWelcomeAndConfirmationBody(
        metadata?.title ?? null,
        metadata?.artist ?? null,
        status.nextDropNum,
        countSoFar
      )
    : smsSubmitConfirmationBody(
        metadata?.title ?? null,
        metadata?.artist ?? null,
        status.nextDropNum,
        countSoFar
      );
}
