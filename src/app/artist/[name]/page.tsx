import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/app/_components/SiteHeader";
import RoleName from "@/app/_components/RoleName";
import FallbackImg from "@/app/_components/FallbackImg";
import PlayableArt from "@/app/_components/PlayableArt";
import { PlayQueue } from "@/app/_components/NowPlayingProvider";
import { getDefaultClub } from "@/lib/club";
import { getSessionMember } from "@/lib/memberSession";
import { getArtistPageData } from "@/lib/artists";
import { normalizeArtistName } from "@/lib/normalize";

export const dynamic = "force-dynamic";

/**
 * An artist's page (2026-10-07 — see claude/next-build.md): purely
 * derived from song data, there's no real artist entity to 404 a
 * lookup against — this 404s only when no published song's artist
 * text normalizes to the key in the URL at all.
 *
 * Public attribution here is curator-only (founder's explicit call):
 * a Listener Pick's real submitter, public on the drop page itself,
 * stays unattributed here. The one private exception is the viewer's
 * own history — if they're logged in and ever curated or submitted one
 * of this artist's songs, a line shows just for them.
 */
export default async function ArtistPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const normalizedName = normalizeArtistName(decodeURIComponent(name));

  const club = await getDefaultClub();
  const viewer = await getSessionMember();
  const artist = await getArtistPageData(club, normalizedName, viewer?.id ?? null);
  if (!artist) notFound();

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <div className="song-tile" style={{ maxWidth: 160, marginBottom: 16 }}>
          {artist.photoUrl ? (
            <FallbackImg src={artist.photoUrl} className="" fallbackClassName="song-tile-empty" />
          ) : (
            <div className="song-tile-empty" aria-hidden="true" />
          )}
        </div>
        <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 6 }}>{artist.displayName}</h1>
        <p className="mut" style={{ fontSize: 12, marginBottom: 24 }}>
          {artist.dropCount} drop{artist.dropCount === 1 ? "" : "s"} · {artist.totalLikes} total like
          {artist.totalLikes === 1 ? "" : "s"}
          {artist.mostLikedSong && <> · most liked: {artist.mostLikedSong.title}</>}
        </p>

        <div className="label" style={{ marginBottom: 12 }}>
          Songs
        </div>
        {/* Player revamp (2026-10-08 — see claude/next-build.md): this
            artist's songs are their own queue — clicking any one plays
            through every song on this page, in this order. */}
        <PlayQueue
          songs={artist.songs.map((s) => ({
            songId: s.songId,
            spotifyUri: s.spotifyUri,
            artworkUrl: s.artworkUrl,
            title: s.title,
            artist: artist.displayName,
          }))}
        >
        <div className="roster-list">
          {artist.songs.map((song) => (
            <div className="roster-row" key={song.songId} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              {/* Artwork next to the song name (2026-10-08 "drop control
                  + playback" round — founder's own ask — see
                  claude/next-build.md), matching the rest of the site's
                  artwork conventions and doubling as this song's play
                  target, same as everywhere else PlayableArt shows up. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <PlayableArt
                  spotifyUri={song.spotifyUri}
                  artworkUrl={song.artworkUrl}
                  title={song.title}
                  artist={artist.displayName}
                  songId={song.songId}
                  className="track-row-art"
                  fallbackClassName="track-row-art track-row-art-empty"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span className="roster-name">
                      <Link href={`/drop/${song.dropNum}`}>{song.title}</Link>
                    </span>
                    <span className="roster-meta">
                      drop {song.dropNum} · ♥ {song.likeCount}
                      {song.rating.count > 0 && ` · ★ ${song.rating.average?.toFixed(1)}`}
                    </span>
                  </div>
                  {song.curatorCredit && (
                    <div className="mut" style={{ fontSize: 10.5 }}>
                      picked by <RoleName name={song.curatorCredit} isCurator />
                    </div>
                  )}
                  {song.isOwnPick && (
                    <div style={{ fontSize: 10.5, color: "var(--accent)" }}>
                      You picked this — drop {song.dropNum}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        </PlayQueue>
      </main>
    </>
  );
}
