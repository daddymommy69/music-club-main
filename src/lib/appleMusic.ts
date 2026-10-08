/**
 * Apple Music link -> title/artist/artwork, using Apple's own free,
 * no-auth iTunes Lookup API (itunes.apple.com/lookup) — not the paid
 * Apple Music API (MusicKit), which needs a developer account and
 * signed tokens. This is the replacement for Odesli/song.link (shut
 * down for good 2026-07-31 — see claude/next-build.md) on the Apple
 * side; the Spotify side is handled directly against Spotify's own API
 * instead (see src/lib/spotify.ts's getSpotifyTrackById/
 * searchSpotifyTrack) — this file only ever deals with Apple links.
 */
export type AppleMusicTrack = {
  title: string;
  artist: string;
  artworkUrl: string | null;
};

/** Pulls the numeric iTunes/Apple Music track id out of either link
 * shape Apple hands out when you hit Share on a song:
 *   .../album/<slug>/<albumId>?i=<trackId>   (older "open in album" link)
 *   .../song/<slug>/<trackId>                (newer direct song link)
 * An album-only link (no track id) returns null — nothing for a single
 * song lookup to resolve to. */
function appleTrackIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const iParam = parsed.searchParams.get("i");
  if (iParam && /^\d+$/.test(iParam)) return iParam;

  const songMatch = parsed.pathname.match(/\/song\/[^/]+\/(\d+)/);
  if (songMatch) return songMatch[1];

  return null;
}

/** Same square-crop fix as the old Odesli path used — Apple's own
 * artwork URLs end with their size as a path segment
 * (".../100x100bb.jpg"), swappable for a bigger square straight from
 * the same CDN rather than stretching the 100x100 Apple gives by
 * default. */
function upsizeArtwork(url: string): string {
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, "/600x600bb.$1");
}

export async function resolveAppleMusicTrack(url: string): Promise<AppleMusicTrack | null> {
  const trackId = appleTrackIdFromUrl(url);
  if (!trackId) return null;

  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${trackId}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: { trackName?: string; artistName?: string; artworkUrl100?: string }[];
    };
    const track = data.results?.[0];
    if (!track?.trackName || !track?.artistName) return null;

    return {
      title: track.trackName,
      artist: track.artistName,
      artworkUrl: track.artworkUrl100 ? upsizeArtwork(track.artworkUrl100) : null,
    };
  } catch {
    return null;
  }
}
