/** Pulls the bare track id back out of a stored `spotify:track:<id>`
 * URI (songs.spotifyUri) — null for anything else (no URI, Apple-only
 * pick, malformed). Every play-on-click surface needs just the bare
 * id: the Web Playback SDK wants the full `spotify:track:<id>` URI
 * back (reconstructed at the call site), and the preview embed wants
 * it in a `/embed/track/<id>` URL. */
export function spotifyTrackIdFromUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const match = uri.match(/^spotify:track:([A-Za-z0-9]+)$/);
  return match ? match[1] : null;
}
