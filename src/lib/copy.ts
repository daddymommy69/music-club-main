/**
 * Centralized site copy (2026-10-18, expanded 2026-10-19 to cover the
 * about page, curator-tools hints, account/settings hints, and every
 * transactional email's subject + body). Every value here must stay a
 * plain literal string — no interpolation, no JSX — so the admin copy
 * editor (/admin/copy) can safely round-trip every field as a plain
 * textarea and regenerate this exact file from whatever's typed there.
 *
 * A few longer fields (aboutText, the email bodies) need pieces that
 * really do have to stay dynamic — a drop count, a real link, a 6-digit
 * code. Those use plain {tokenName} placeholders instead of real JS
 * interpolation, specifically so they survive being plain text in a
 * textarea: renderTemplate/renderAboutHtml below fill them back in at
 * render time. Leave the exact {bracketed} name in place when editing
 * around it — if it's deleted or misspelled, that one dynamic piece
 * just won't appear, nothing else breaks.
 */
export const siteCopy = {
  // Home / site-wide
  homeIntro:
    "a music club for friends. every so often a drop gets picked and shipped — here's everything so far.",
  tagline: "curated by jacob & friends",
  footerSignature: "powered by jacob fogelhut",

  // About page — one field, paragraphs separated by a blank line.
  // {dropCount}/{songCount}/{artistCount} are the live counts;
  // [archives](/releases) and [subscribe](/account) are links — keep
  // the brackets-and-parens shape, change only the words inside the
  // first brackets or the path inside the parens.
  aboutText:
    "welcome to the club.\n\nevery so often, a playlist will drop and get sent to subscribers in their email. there are {dropCount} drops, {songCount} songs, from {artistCount} artists.\n\ntake a look at the [archives](/releases) and the music we listen to. please enjoy and [subscribe](/account) to get the playlists sent to your email directly.",

  // Curator tools
  dropBlurbPlaceholder:
    "What's this drop about? Any notes you want to say about the songs, or your own thoughts — think of this as a musical journal, let it spill.",
  songBlurbPlaceholder:
    "Any notes you want to say about this song, or your thoughts — think of this as a musical journal, let it spill.",
  curatorHelpText:
    "when you ship a drop, we try to build the spotify playlist automatically from this cycle's picks — but only if spotify's connected in settings. if it's not connected, nothing gets built on its own, so paste a playlist link in yourself before shipping.\n\nyou can also schedule a drop to open and ship on its own — set the dates in settings and it handles itself from there.\n\nsubscribers get emailed the second it ships, so double check the picks first.",
  pilePickHint: "Songs people submit land here first — Quick-add pulls one into this cycle's picks.",
  emptyPicksText: "No picks yet — search above to add one.",
  emptyPileText: "Nothing submitted for this drop yet.",
  addPickSearchPlaceholder: "Search Spotify for a song…",

  // Account
  noOpenDropText: "No drop is open for submissions right now.",
  noBioText: "No bio yet.",
  namePlaceholder: "Your name",
  bioPlaceholder: "A short line about you",
  noPicksYetText: "No picks yet.",
  noLikesYetText: "Nothing liked yet — songs you like will show up here as artwork.",
  noShippedPicksText: "No shipped picks yet.",
  noShippedDropsText: "No shipped drops yet.",

  // Settings
  cycleManualHint: "Manual means no scheduled date — every countdown in the app disappears.",
  spotifyConnectedHint:
    "Connected — shipping a drop with the Spotify field left blank auto-builds that playlist.",
  spotifyNotConnectedHint:
    "Not connected — ship currently needs a Spotify link pasted in by hand. Connect your account to auto-build it instead.",
  noCuratorsText: "No curators yet.",
  pendingCuratorHint: "pending — becomes curator on signup",
  curatorEmailPlaceholder: "their@email.com",
  curatorInviteHint:
    "Already signed up? They become a curator right away. Haven't signed up yet? It's saved here and applies automatically the moment they do.",

  // Emails — {tokens} are filled in from the real drop/member/club at
  // send time. Keep them in place, same rule as aboutText above.
  welcomeEmailSubject: "welcome to the club",
  welcomeEmailBody:
    '<p>you will get emailed each drop when they drop.</p>{currentDropLine}<p>check the <a href="{websiteUrl}">website</a> to see when the next one is coming.</p><p>thanks player and enjoy</p>',
  curatorGrantedEmailSubject: "you're a chosen one",
  curatorGrantedEmailBody:
    '<p>you are now a chosen curator for our music club. <a href="{curatorLink}">click the link to start the playerz parade</a></p>',
  confirmationEmailSubject: "You're in!",
  confirmationEmailBody:
    "<p>You're in! Welcome to <strong>{clubName}</strong>.</p><p>You'll get an email when the next playlist drops.</p>",
  releaseEmailSubject: "new playlist is here",
  releaseEmailBody:
    '<p>new playlist from <strong>{clubName}</strong> — {dropLabel}.</p>{cover}{notesHtml}<p><a href="{page}">check it out</a>{spotifyLink}.</p>',
  top10ReleaseEmailSubject: "The Subscriber Top 10 is up 🎶",
  top10ReleaseEmailBody:
    '<p>The Subscriber Top 10 for drop {dropNum} is up — songs you all voted for:</p><p><a href="{page}">See the results</a></p>',
  loginCodeEmailSubject: "Your login code",
  loginCodeEmailBody: "<p>Your code: <strong>{code}</strong></p>",
};

export type SiteCopyKey = keyof typeof siteCopy;

/**
 * Fills {token} placeholders in a copy template. An unrecognized token
 * is left exactly as typed rather than erased — a typo'd {tokne} name
 * shows up visibly wrong in the output instead of silently vanishing,
 * which is easier to notice and fix than a blank gap would be.
 */
export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in tokens ? tokens[key] : match));
}

/**
 * Renders the About page's one big text field to HTML: fills {tokens},
 * turns blank-line-separated chunks into paragraphs, and turns
 * [label](url) into a real link. This is the one spot in the app that
 * goes through dangerouslySetInnerHTML — safe here specifically because
 * this field can only ever be changed through the admin-only copy
 * editor (same trust level as Jacob editing a source file directly),
 * and nothing else ever writes to it.
 */
export function renderAboutHtml(template: string, tokens: Record<string, string>): string {
  const filled = renderTemplate(template, tokens);
  return filled
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="about-link">$1</a>'))
    .map((p) => `<p>${p}</p>`)
    .join("\n");
}

/** Splits a multi-paragraph copy field (blank-line separated) into an
 * array for plain-React rendering (no links/HTML needed) — e.g.
 * curatorHelpText in CuratorToolsPanel.tsx. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
