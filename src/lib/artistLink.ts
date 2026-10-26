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

/**
 * Same destination as artistHref, plus two query-string hints used only
 * by /artist/[name]'s not-featured-yet fallback (2026-10-26 round — see
 * claude/next-build.md): `name` carries the real casing (the path
 * segment itself is always the lowercased key), and `sid` carries the
 * clicked track's own artist Spotify id when there is one, so that page
 * can resolve an exact Spotify match instead of guessing by name.
 *
 * Deliberately its own function rather than an optional param on
 * artistHref — every other call site (a drop page, Liked Songs, the
 * Browse directory grids) already links to an artist who's definitely
 * in this app's DB, so those hints would never be read and would just
 * clutter the URL. Only Browse's live Spotify search results
 * (BrowseSearch.tsx's SpotifyResultRow) can land on an artist who isn't
 * in the DB yet, so only that one call site uses this.
 */
export function artistHrefForSpotifyResult(artist: string, spotifyArtistId: string | null | undefined): string {
  const params = new URLSearchParams({ name: artist.trim() });
  if (spotifyArtistId) params.set("sid", spotifyArtistId);
  return `${artistHref(artist)}?${params.toString()}`;
}
