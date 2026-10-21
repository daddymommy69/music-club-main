/**
 * The URL a member's public profile links to, everywhere a user's name
 * becomes clickable (drop-page contributor list, Browse's Users tab).
 * Kept in its own tiny, dependency-free file (2026-10-19), same reason
 * as artistLink.ts's artistHref: importable from "use client"
 * components without dragging server-only code (the DB client) into
 * the browser bundle. Unlike artistHref, there's no normalization step
 * here — a member's slug is already the exact, stable URL key (see
 * db/schema.ts's members.slug), not something derived on the fly from
 * free text.
 */
export function userHref(slug: string): string {
  return `/u/${encodeURIComponent(slug)}`;
}
