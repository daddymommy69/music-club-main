import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/app/_components/SiteHeader";
import RoleName from "@/app/_components/RoleName";
import FallbackImg from "@/app/_components/FallbackImg";
import PlayableArt from "@/app/_components/PlayableArt";
import { PlayQueue } from "@/app/_components/NowPlayingProvider";
import { getDefaultClub } from "@/lib/club";
import { getSessionMember } from "@/lib/memberSession";
import { getArtistPageData, getArtistFallbackData, type ArtistPageData } from "@/lib/artists";
import { normalizeArtistName } from "@/lib/normalize";
import { userHref } from "@/lib/userHref";

export const dynamic = "force-dynamic";

/**
 * An artist's page (2026-10-07 — see claude/next-build.md): purely
 * derived from song data, there's no real artist entity in this
 * schema's sense.
 *
 * Gained a not-featured-yet fallback (2026-10-26 round — see
 * claude/next-build.md: founder's report that clicking an artist name
 * off a live Spotify search result in Browse 404'd, since that artist
 * had never actually had a song in a drop here). When no published
 * song's artist text normalizes to the key in the URL, this now tries
 * Spotify's own artist lookup (getArtistFallbackData) before giving up
 * — same page template, same photo/name header, just an empty Songs
 * list and a line saying so instead of a hard 404. The 404 is still
 * what happens when Spotify itself can't resolve anything either
 * (founder's own call, 2026-10-26: "old 404 for now i guess" for that
 * one edge case) — e.g. a typo'd URL, not a real artist at all.
 *
 * Public attribution here is curator-only (founder's explicit call):
 * a Listener Pick's real submitter, public on the drop page itself,
 * stays unattributed here. The one private exception is the viewer's
 * own history — if they're logged in and ever curated or submitted one
 * of this artist's songs, a line shows just for them.
 */
export default async function ArtistPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  /** Hints only — see artistHrefForSpotifyResult in artistLink.ts. Read
   * only when there's no DB match at all; a real, already-featured
   * artist's page never looks at these. */
  searchParams: Promise<{ name?: string; sid?: string }>;
}) {
  const { name } = await params;
  const { name: nameHint, sid } = await searchParams;
  const normalizedName = normalizeArtistName(decodeURIComponent(name));

  const club = await getDefaultClub();
  const viewer = await getSessionMember();
  const artist = await getArtistPageData(club, normalizedName, viewer?.id ?? null);

  if (artist) {
    return <ArtistPageBody artist={artist} notFeatured={false} />;
  }

  const fallback = await getArtistFallbackData(club, normalizedName, nameHint ?? normalizedName, sid ?? null);
  if (!fallback) notFound();

  return (
    <ArtistPageBody
      artist={{ ...fallback, dropCount: 0, totalLikes: 0, mostLikedSong: null, songs: [] }}
      notFeatured
    />
  );
}

function ArtistPageBody({ artist, notFeatured }: { artist: ArtistPageData; notFeatured: boolean }) {
  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <div style={{ marginBottom: 18 }}>
          <Link href="/browse" className="mut" style={{ fontSize: 11 }}>
            ← Back to Browse
          </Link>
        </div>

        <div className="song-tile" style={{ maxWidth: 160, marginBottom: 16 }}>
          {artist.photoUrl ? (
            <FallbackImg src={artist.photoUrl} className="" fallbackClassName="song-tile-empty" />
          ) : (
            <div className="song-tile-empty" aria-hidden="true" />
          )}
        </div>
        <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 6 }}>{artist.displayName}</h1>

        {notFeatured ? (
          <p className="mut" style={{ fontSize: 12, marginBottom: 24 }}>
            Hasn&rsquo;t been featured here yet — head back to Browse and search their name to submit one of
            their songs as a pick.
          </p>
        ) : (
          <p className="mut" style={{ fontSize: 12, marginBottom: 24 }}>
            {artist.dropCount} drop{artist.dropCount === 1 ? "" : "s"} · {artist.totalLikes} total like
            {artist.totalLikes === 1 ? "" : "s"}
            {artist.mostLikedSong && <> · most liked: {artist.mostLikedSong.title}</>}
          </p>
        )}

        <div className="label" style={{ marginBottom: 12 }}>
          Songs
        </div>
        {/* Player revamp (2026-10-08 — see claude/next-build.md): this
            artist's songs are their own queue — clicking any one plays
            through every song on this page, in this order. Empty for the
            not-featured-yet fallback above, same as it'd be for any real
            artist with zero songs — PlayQueue/the empty roster-list below
            both already handle that with no special-casing needed here. */}
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
                    {/* flexShrink:0 + nowrap (2026-10-26 round — see
                        claude/next-build.md and the identical fix/comment on
                        src/app/u/[slug]/page.tsx, this page's styling twin):
                        without these, a long song title next to this span
                        made the row's flexbox shrink BOTH items to fit,
                        breaking this stats line across two lines too. */}
                    <span className="roster-meta" style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                      drop {song.dropNum} · ♥ {song.likeCount}
                      {song.rating.count > 0 && ` · ★ ${song.rating.average?.toFixed(1)}`}
                    </span>
                  </div>
                  {/* Clickable to that curator's profile when they have
                      one (2026-10-26 round — see claude/next-build.md:
                      founder's own ask, same treatment DropDetail's
                      per-song credit now has too). */}
                  {song.curatorCredit && (
                    <div className="mut" style={{ fontSize: 10.5 }}>
                      picked by{" "}
                      {song.curatorSlug ? (
                        <Link href={userHref(song.curatorSlug)}>
                          <RoleName name={song.curatorCredit} isCurator />
                        </Link>
                      ) : (
                        <RoleName name={song.curatorCredit} isCurator />
                      )}
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
