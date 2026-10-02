import { getSongEmbed } from "@/lib/embed";

/** Renders nothing if the link isn't a recognized Spotify/Apple Music
 * URL — the plain title/artist text above it is still there either
 * way, this is purely additive. */
export default function SongEmbed({ sourceUrl }: { sourceUrl: string | null }) {
  const embed = getSongEmbed(sourceUrl);
  if (!embed) return null;

  return (
    <div className="track-embed">
      <iframe
        src={embed.url}
        height={embed.height}
        allow="autoplay *; encrypted-media *; clipboard-write"
        loading="lazy"
        title="Embedded song player"
      />
    </div>
  );
}
