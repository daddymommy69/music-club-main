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
      artworkUrl: entity.thumbnailUrl ?? null,
    };
  } catch {
    return null;
  }
}
