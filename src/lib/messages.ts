import type { Drop } from "@/db/schema";
import { siteUrl } from "@/lib/site";

const CLUB_NAME = process.env.NEXT_PUBLIC_CLUB_NAME || "the music club";

export function confirmationSmsBody() {
  return `You're in! Welcome to ${CLUB_NAME}. You'll get a text when the next playlist drops. Reply STOP anytime to unsubscribe.`;
}

export function confirmationEmailHtml() {
  return `<p>You're in! Welcome to <strong>${CLUB_NAME}</strong>.</p><p>You'll get an email when the next playlist drops.</p>`;
}

/** Every text/email points here, not straight at the raw playlist URLs —
 * this is "the link in your text" that #/you's own copy refers to. */
function youUrl(youToken: string) {
  return siteUrl(`/you/${youToken}`);
}

export function releaseSmsBody(drop: Drop, youToken: string) {
  const label = drop.title ? `drop ${drop.num} — "${drop.title}"` : `drop ${drop.num}`;
  const lines = [
    `New playlist from ${CLUB_NAME} (${label}): ${youUrl(youToken)}`,
    "Reply STOP to unsubscribe.",
  ];
  return lines.join("\n");
}

export function releaseEmailHtml(drop: Drop, youToken: string) {
  const label = drop.title ? `drop ${drop.num} — "${drop.title}"` : `drop ${drop.num}`;
  return `<p>New playlist from <strong>${CLUB_NAME}</strong> (${label}):</p><p><a href="${youUrl(
    youToken
  )}">See what's on it</a></p>`;
}

/** Points at the public drop page, not /you — the Top 10 result is
 * public (it's the archive's own "Subscriber Top 10" section), so
 * there's no reason to route this through a personal token link. */
function dropUrl(dropNum: number) {
  return siteUrl(`/drop/${dropNum}`);
}

/** Sent once a curator pastes in the Top 10 playlist link — i.e. only
 * when turnout hit the 10-song threshold. Below that, this never fires
 * and the (small) result just sits on the archive quietly, per the old
 * plan's "if turnout is very low, skip the release message." */
export function top10ReleaseSmsBody(dropNum: number) {
  const lines = [
    `The Subscriber Top 10 for drop ${dropNum} is up — songs you all voted for: ${dropUrl(dropNum)}`,
    "Reply STOP to unsubscribe.",
  ];
  return lines.join("\n");
}

export function top10ReleaseEmailHtml(dropNum: number) {
  return `<p>The Subscriber Top 10 for drop ${dropNum} is up — songs you all voted for:</p><p><a href="${dropUrl(
    dropNum
  )}">See the results</a></p>`;
}

/**
 * SMS text-in (old plan.md Phase 1's second submission channel, built
 * 2026-08-29 — texting a link to the club number does the same thing as
 * the /submit web form). Every reply here is plain text, no links —
 * unlike the release/confirmation messages above, this is a two-way
 * exchange over the same number people already text, so a bare "Got it"
 * fits better than another URL to tap.
 */
export function smsSubmitNoLinkBody() {
  return "Didn't catch a link there — text a Spotify or Apple Music song link to submit a pick.";
}

export function smsSubmitClosedBody(daysUntilNext: number | null, isManual: boolean) {
  if (isManual) return "Submissions open when the next drop goes out.";
  const days = daysUntilNext ?? null;
  if (days === null) return "Submissions are closed right now — check back soon.";
  return `Submissions are closed right now — they open again in about ${days} day${
    days === 1 ? "" : "s"
  }.`;
}

function songLabel(title: string | null, artist: string | null) {
  return title && artist ? `"${title}" by ${artist}` : "Your pick";
}

export function smsSubmitConfirmationBody(
  title: string | null,
  artist: string | null,
  dropNum: number,
  countSoFar: number
) {
  return `Got it — ${songLabel(title, artist)} is in for drop ${dropNum} (${countSoFar} submitted so far).`;
}

/** Sent instead of the plain confirmation above when this phone number
 * wasn't already a subscriber — folds the /subscribe welcome text and
 * the submission confirmation into one message rather than sending two
 * texts back to back. */
export function smsSubmitWelcomeAndConfirmationBody(
  title: string | null,
  artist: string | null,
  dropNum: number,
  countSoFar: number
) {
  return `You're in! Welcome to ${CLUB_NAME}. ${songLabel(
    title,
    artist
  )} is in for drop ${dropNum} (${countSoFar} submitted so far). You'll also get a text when it drops — reply STOP anytime to unsubscribe.`;
}
