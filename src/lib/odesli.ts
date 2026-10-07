/**
 * Odesli / song.link — free, no-auth link resolver. Given a Spotify or
 * Apple Music link, returns title/artist/artwork. Best-effort only: a
 * submission still succeeds with no metadata if this fails or times
 * out, the same pattern used for SMS/email sends elsewhere in this
 * codebase. (This sandbox's egress policy blocks api.song.link, so
 * this path is untested here — verify against a real submission once
 * deployed somewhere with open egress.)
 */
export type OdesliMetadata = {
  title: string;
  artist: string;
  artworkUrl: string | null;
};

/**
 * The actual bug behind every "artwork still has a white frame" report
 * this round (2026-10-07 — see claude/next-build.md): for an Apple
 * Music entity, Odesli's thumbnailUrl is sometimes mzstatic's 1200x630
 * "wp" link-preview crop (the wide image Apple generates for social/
 * link-preview cards), not the square album cover — a genuinely
 * non-square source image that no amount of CSS (object-fit: cover
 * included) can turn square without cropping content away. mzstatic
 * URLs end with their size/crop directive as its own path segment
 * (".../hash/track.jpg/1200x630wp-60.jpg"), and that segment can be
 * swapped for a square one to re-request the SAME underlying image,
 * just cropped square instead — a safe no-op on any URL that doesn't
 * match this exact shape (Spotify's i.scdn.co URLs, square mzstatic
 * "bb" URLs already, etc.).
 */
function squareArtworkUrl(url: string): string {
  return url.replace(/\/\d+x\d+(?:bb|wp)(?:-\d+)?\.(jpg|png)$/i, "/600x600bb.$1");
}

export async function resolveSongMetadata(url: string): Promise<OdesliMetadata | null> {
  try {
    const res = await fetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      entityUniqueId?: string;
      entitiesByUniqueId?: Record<
        string,
        { title?: string; artistName?: string; thumbnailUrl?: string }
      >;
    };

    const entity = data.entityUniqueId
      ? data.entitiesByUniqueId?.[data.entityUniqueId]
      : undefined;

    if (!entity?.title || !entity?.artistName) return null;

    return {
      title: entity.title,
      artist: entity.artistName,
      artworkUrl: entity.thumbnailUrl ? squareArtworkUrl(entity.thumbnailUrl) : null,
    };
  } catch {
    return null;
  }
}
