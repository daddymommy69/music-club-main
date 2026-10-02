/**
 * Turns a plain Spotify/Apple Music link (what a curator pastes in) into
 * its embeddable-player form. Both platforms embed by rewriting the
 * normal share URL rather than needing a separate API call or key:
 *   - Apple Music: music.apple.com  → embed.music.apple.com (same path)
 *   - Spotify:     open.spotify.com → open.spotify.com/embed (prefixed)
 */
export type SongEmbed = {
  url: string;
  provider: "apple" | "spotify";
  /** Apple's compact player is naturally shorter than Spotify's. */
  height: number;
};

export function getSongEmbed(sourceUrl: string | null): SongEmbed | null {
  if (!sourceUrl) return null;

  try {
    const parsed = new URL(sourceUrl);

    if (parsed.hostname === "music.apple.com") {
      const embed = new URL(sourceUrl);
      embed.hostname = "embed.music.apple.com";
      return { url: embed.toString(), provider: "apple", height: 175 };
    }

    if (parsed.hostname === "open.spotify.com") {
      const embed = new URL(sourceUrl);
      embed.pathname = `/embed${parsed.pathname}`;
      return { url: embed.toString(), provider: "spotify", height: 152 };
    }

    return null;
  } catch {
    // Not a parseable URL — shouldn't happen since submission already
    // validates the link, but never let a bad string crash the page.
    return null;
  }
}
