/**
 * Spotify playlist description builder (2026-10-24 round — founder's
 * own ask: "the drop blurb info the first part of the spotify
 * description", keeping the existing "Drop N | project music club"
 * identifier after it). Shared between the server-side auto-build
 * (spotifyBuild.ts) and the curator-facing character counter in the
 * drop blurb compose box (CuratorToolsPanel.tsx's DropBlurbCard), so
 * both agree on exactly how much room is left for a curator's own
 * words before Spotify's own 300-character description limit bites.
 *
 * Founder's own answer on which post(s) feed this: every post in the
 * drop's "About this drop" feed, combined — not just the first one —
 * same spirit as ThoughtsSection already combining every pick's own
 * commentary into one place rather than picking a single post to
 * represent the whole drop.
 */

/** Spotify truncates/rejects playlist descriptions past this length. */
export const SPOTIFY_DESCRIPTION_LIMIT = 300;

const SEPARATOR = " | ";

/** The fixed part of the description that always survives, regardless
 * of how long the blurb is — same text the description has always
 * ended with. */
export function spotifyDescriptionSuffix(dropNum: number): string {
  return `Drop ${dropNum} | project music club`;
}

/** Every "About this drop" post, oldest first, joined into one block
 * of text — same combined-not-cherry-picked approach ThoughtsSection
 * already uses for a drop's write-up. */
export function combineDropNotes(notes: { text: string }[]): string {
  return notes
    .map((n) => n.text.trim())
    .filter(Boolean)
    .join(" · ");
}

/** How many characters a curator's combined blurb has to work with
 * before the fixed "Drop N | project music club" suffix no longer
 * fits inside Spotify's 300-char limit — what the live character
 * counter in the blurb compose box checks against. */
export function spotifyBlurbBudget(dropNum: number): number {
  const suffix = spotifyDescriptionSuffix(dropNum);
  return SPOTIFY_DESCRIPTION_LIMIT - suffix.length - SEPARATOR.length;
}

/**
 * The actual description sent to Spotify: the combined blurb text
 * first, then the fixed suffix — truncated (never the suffix, always
 * the blurb) if the combined text runs over budget. An empty blurb
 * (no posts yet) falls back to just the suffix, exactly what the
 * description has always been.
 */
export function buildSpotifyDescription(dropNum: number, blurbText: string): string {
  const suffix = spotifyDescriptionSuffix(dropNum);
  const trimmed = blurbText.trim();
  if (!trimmed) return suffix;

  const budget = spotifyBlurbBudget(dropNum);
  const blurb =
    trimmed.length > budget ? `${trimmed.slice(0, Math.max(0, budget - 1)).trimEnd()}…` : trimmed;

  return `${blurb}${SEPARATOR}${suffix}`;
}
