import { normalizeArtistName } from "./normalize";

/**
 * The URL an artist's name links to, everywhere a song's artwork or
 * name becomes clickable (track rows, the hero drop-tile, Liked Songs,
 * Browse). Kept in its own tiny, dependency-free file (2026-10-07 — see
 * claude/next-build.md) rather than src/lib/artists.ts, which pulls in
 * the DB client — this needs to be importable from "use client"
 * components (AccountBoard.tsx) without dragging server-only code into
 * the browser bundle. Always built from the normalized key so two
 * different casings of the same name land on the same page.
 */
export function artistHref(artist: string): string {
  return `/artist/${encodeURIComponent(normalizeArtistName(artist))}`;
}
