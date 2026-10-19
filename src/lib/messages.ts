import type { Drop } from "@/db/schema";
import { siteUrl } from "@/lib/site";
import { siteCopy, renderTemplate } from "@/lib/copy";

const CLUB_NAME = process.env.NEXT_PUBLIC_CLUB_NAME || "the music club";

export function confirmationSmsBody() {
  return `You're in! Welcome to ${CLUB_NAME}. You'll get a text when the next playlist drops. Reply STOP anytime to unsubscribe.`;
}

/** 2026-10-19 — subject/body moved into siteCopy (src/lib/copy.ts),
 * editable from /admin/copy. {clubName} is the one dynamic piece. */
export const CONFIRMATION_SUBJECT = siteCopy.confirmationEmailSubject;

export function confirmationEmailHtml() {
  return renderTemplate(siteCopy.confirmationEmailBody, { clubName: CLUB_NAME });
}

/** Where "here"/"the website" in the welcome email below point — the
 * public releases page (site home), not one specific drop's own page,
 * so the "next drop" schedule line that page already shows sits right
 * alongside the current drop just linked. */
function releasesUrl() {
  return siteUrl("/releases");
}

/** Sent once, right when a brand-new person finishes signing up on
 * /account (src/app/api/members/lookup's "created" branch — the
 * lightweight, no-code signup path, so this fires immediately on
 * signup itself, not after some later "verification" step; a
 * brand-new member never goes through one). 2026-10-10 — founder's own
 * wording, see claude/next-build.md. 2026-10-19 — moved into siteCopy,
 * editable from /admin/copy. */
export const WELCOME_SUBJECT = siteCopy.welcomeEmailSubject;

/** currentDrop is whatever getLatestPublicDrop() returned — null if
 * nobody's shipped a drop yet, in which case the "check out the
 * current drop" line is skipped entirely (founder's own call) rather
 * than showing a placeholder. That whole dynamic paragraph is built
 * here and dropped into {currentDropLine} — it's not itself part of
 * the editable template, since it has to stay in sync with whether a
 * drop actually exists. */
export function welcomeEmailHtml(currentDrop: { num: number; title: string | null } | null) {
  const dropLine = currentDrop
    ? `<p>check out the current drop <a href="${releasesUrl()}">here</a>: ${
        currentDrop.title ? `drop ${currentDrop.num} — "${currentDrop.title}"` : `drop ${currentDrop.num}`
      }.</p>`
    : "";
  return renderTemplate(siteCopy.welcomeEmailBody, { currentDropLine: dropLine, websiteUrl: releasesUrl() });
}

/** Where the "you're a chosen one" email's link points — the curator
 * login, same page the admin route's own doc comment calls out as
 * where a freshly-granted curator logs in for the first time. Only
 * valid once a member row with isCurator already exists — see
 * curatorInviteEmailHtml below for the not-signed-up-yet case, which
 * can't use this (the curator-login route 400s for an email with no
 * member yet — see /api/curators/lookup's own comment). */
function curatorLoginUrl() {
  return siteUrl("/curators");
}

/** Sent once, right when a member is granted curator status — either
 * an immediate grant on /settings (src/app/api/admin/members/curator's
 * route) or a pending invite consumed on signup (members.ts's
 * findOrCreateMember). Never sent for a revoke, and never sent for the
 * founder's own bootstrap grant (ensureFounderAccess) — see
 * claude/next-build.md, 2026-10-09 curator-notification round.
 * 2026-10-19 — moved into siteCopy. */
export const CURATOR_GRANTED_SUBJECT = siteCopy.curatorGrantedEmailSubject;

export function curatorGrantedEmailHtml() {
  return renderTemplate(siteCopy.curatorGrantedEmailBody, { curatorLink: curatorLoginUrl() });
}

/** Sent right when an admin grants curator to an email with no member
 * yet (addPendingCurator — the admin route's own "pending" branch).
 * The founder's call: reuse the exact same "you're a chosen one"
 * email rather than write a second one — the only thing that has to
 * differ is the link, since /curators itself refuses anyone with no
 * member row yet. Once they actually sign up, findOrCreateMember
 * promotes them and sends curatorGrantedEmailHtml() above — same
 * subject, same wording (both come from siteCopy.curatorGrantedEmailBody
 * as of 2026-10-19), now pointed at /curators since it'll actually
 * work by then. */
export function curatorInviteEmailHtml() {
  return renderTemplate(siteCopy.curatorGrantedEmailBody, { curatorLink: siteUrl("/signup") });
}

/** Every text/email points here, not straight at the raw playlist URLs —
 * this is "the link in your text" that #/you's own copy refers to. */
function memberUrl(memberToken: string) {
  return siteUrl(`/you/${memberToken}`);
}

export function releaseSmsBody(drop: Drop, memberToken: string) {
  const label = drop.title ? `drop ${drop.num} — "${drop.title}"` : `drop ${drop.num}`;
  const lines = [
    `New playlist from ${CLUB_NAME} (${label}): ${memberUrl(memberToken)}`,
    "Reply STOP to unsubscribe.",
  ];
  return lines.join("\n");
}

/** Points at the public drop page, not /you — the Top 10 result (and,
 * as of the 2026-10-10 release-email rewrite below, the release email
 * itself) is public, so there's no reason to route either through a
 * personal token link. */
function dropUrl(dropNum: number) {
  return siteUrl(`/drop/${dropNum}`);
}

/** Where the release email's drop-cover <img> is fetched from — the
 * same 2x2 artwork grid + drop-number overlay that becomes the Spotify
 * playlist's own cover, regenerated on request rather than stored
 * anywhere (see src/app/api/drops/[num]/cover/route.ts's own comment
 * for why). */
function dropCoverImageUrl(dropNum: number) {
  return siteUrl(`/api/drops/${dropNum}/cover`);
}

/** Founder's own rewrite, 2026-10-10 (see claude/next-build.md): now
 * links straight to the drop's own public page (not the personal /you
 * link releaseSmsBody above still uses — text wasn't part of this
 * round) plus a cover-image thumbnail of the same art that's now the
 * Spotify playlist's cover, and a second, direct link to the Spotify
 * playlist itself when one exists. No memberToken anymore — nothing
 * here is personalized. drop.spotifyUrl is null only when a drop
 * shipped with just an Apple Music link pasted in by hand; the "on
 * spotify" link is simply skipped in that case rather than pointing
 * nowhere — the drop's own page still has the Apple Music option.
 *
 * `notes` (2026-10-16 — founder's own ask: "this blurb will be the
 * email writing as well") is whatever curators wrote in the new
 * "About this drop" blurb (CuratorToolsPanel.tsx's NotesCard) — the
 * drop-level blurb only; the per-song blurbs show on the drop page
 * itself but aren't folded into this email, since the email doesn't
 * list individual songs at all today. Caller (src/lib/release.ts)
 * fetches these once before the send loop and passes them in; empty
 * when nobody's written one, same quiet-by-default spirit as every
 * other optional block here.
 *
 * 2026-10-19 — subject/body moved into siteCopy; everything built here
 * (cover, notesHtml, spotifyLink, the label/page) stays dynamic and is
 * dropped into the template's {tokens}. */
export const RELEASE_SUBJECT = siteCopy.releaseEmailSubject;

export function releaseEmailHtml(drop: Drop, notes: { curatorName: string; text: string }[] = []) {
  const label = drop.title ? `drop ${drop.num} — "${drop.title}"` : `drop ${drop.num}`;
  const page = dropUrl(drop.num);
  const cover = `<a href="${page}"><img src="${dropCoverImageUrl(
    drop.num
  )}" alt="${label}" width="320" style="display:block;max-width:100%;height:auto;border:0;" /></a>`;
  const spotifyLink = drop.spotifyUrl ? ` or go straight to it <a href="${drop.spotifyUrl}">on spotify</a>` : "";
  const notesHtml = notes
    .map(
      (n) =>
        `<p>${n.text}<br/><span style="color:#888;font-size:12px;">— ${n.curatorName}</span></p>`
    )
    .join("");
  return renderTemplate(siteCopy.releaseEmailBody, {
    clubName: CLUB_NAME,
    dropLabel: label,
    cover,
    notesHtml,
    page,
    spotifyLink,
  });
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

export const TOP10_RELEASE_SUBJECT = siteCopy.top10ReleaseEmailSubject;

export function top10ReleaseEmailHtml(dropNum: number) {
  return renderTemplate(siteCopy.top10ReleaseEmailBody, { dropNum: String(dropNum), page: dropUrl(dropNum) });
}

/** Sent once a login code is issued (src/lib/members.ts's
 * issueLoginCode). 2026-10-19 — moved into siteCopy; {code} is the
 * one dynamic piece. */
export const LOGIN_CODE_SUBJECT = siteCopy.loginCodeEmailSubject;

export function loginCodeEmailHtml(code: string) {
  return renderTemplate(siteCopy.loginCodeEmailBody, { code });
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
