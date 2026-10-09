/**
 * The one place "is this the same song" should live (2026-10-09 audit
 * consolidation — see claude/next-build.md). duplicateCheck.ts and
 * top10.ts each carried their own near-identical copy of this exact
 * title+artist comparison before now — small, easy to drift apart
 * without anyone noticing, which is exactly the kind of thing worth
 * consolidating per the audit's own "worth consolidating next time
 * either one needs a change" note.
 *
 * Same song if both sides have resolved title+artist and they match
 * (case/whitespace-insensitive) — catches a Spotify link and an Apple
 * Music link for the same track, which won't share a URL.
 */
export function sameSongByTitleArtist(
  aTitle: string | null | undefined,
  aArtist: string | null | undefined,
  bTitle: string | null | undefined,
  bArtist: string | null | undefined
): boolean {
  if (!aTitle || !aArtist || !bTitle || !bArtist) return false;
  return (
    aTitle.trim().toLowerCase() === bTitle.trim().toLowerCase() &&
    aArtist.trim().toLowerCase() === bArtist.trim().toLowerCase()
  );
}
