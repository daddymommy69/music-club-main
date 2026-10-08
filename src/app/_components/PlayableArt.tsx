"use client";

import FallbackImg from "./FallbackImg";
import { usePlayer, type PlayableTrack } from "./NowPlayingProvider";
import { spotifyTrackIdFromUri } from "@/lib/spotifyId";

/**
 * Clickable artwork that plays through NowPlayingProvider's floating
 * bar (2026-10-08 "drop control + playback" round — see
 * claude/next-build.md): the founder's own ask, "clicking the artwork
 * of a song only, it plays from spotify." A play/pause icon only shows
 * on hover/focus ("maybe when scrolled upon the play button will
 * show") — at rest this looks exactly like the plain artwork every
 * other spot on the site already renders.
 *
 * Deliberately NOT a link — DropDetail used to wrap artwork in a link
 * to the song's artist page; now that artwork's click target is play,
 * that's the title/artist TEXT's job instead. Wire a separate <Link>
 * next to wherever this is used (see artistHref).
 *
 * Renders a plain static image with no play affordance at all when
 * there's no resolved Spotify id (Apple-only pick, or auto-build never
 * found a match) — nothing to play, so this never pretends otherwise.
 */
export default function PlayableArt({
  spotifyUri,
  artworkUrl,
  title,
  artist,
  className = "track-row-art",
  fallbackClassName = "track-row-art track-row-art-empty",
}: {
  spotifyUri: string | null | undefined;
  artworkUrl: string | null | undefined;
  title: string;
  artist: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const { current, mode, play } = usePlayer();
  const trackId = spotifyTrackIdFromUri(spotifyUri);
  const isThisTrack = !!trackId && current?.id === trackId;
  const isPlayingThis = isThisTrack && mode !== null;

  const art = artworkUrl ? (
    <FallbackImg src={artworkUrl} alt="" className={className} fallbackClassName={fallbackClassName} />
  ) : (
    <div className={fallbackClassName} aria-hidden="true" />
  );

  if (!trackId) {
    return <div className="playable-art">{art}</div>;
  }

  return (
    <button
      type="button"
      className="playable-art playable-art-active"
      onClick={() => play({ id: trackId, title, artist, artworkUrl: artworkUrl ?? null })}
      aria-label={isPlayingThis ? `Pause ${title}` : `Play ${title}`}
      aria-pressed={isPlayingThis}
    >
      {art}
      <span className={`playable-art-icon${isPlayingThis ? " is-playing" : ""}`} aria-hidden="true">
        {isPlayingThis ? "❙❙" : "▶"}
      </span>
    </button>
  );
}

export type { PlayableTrack };
