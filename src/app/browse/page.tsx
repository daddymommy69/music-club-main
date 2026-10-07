import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import BrowseSearch from "@/app/_components/BrowseSearch";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import { getSessionMember } from "@/lib/memberSession";
import { getBrowseDirectory } from "@/lib/browse";
import { getOrFetchArtistPhoto } from "@/lib/artists";
import { artistHref } from "@/lib/artistLink";
import type { Club } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * /browse (2026-10-07 — replaces /submit, see claude/next-build.md).
 * Default view is a plain directory of every artist and song that's
 * actually been featured on the site, open to logged-out visitors, no
 * typing required. The one search bar (BrowseSearch) is a separate
 * thing layered on top — live Spotify search, with a "submit as my
 * pick" action that only shows up when a drop is currently open.
 */
export default async function BrowsePage() {
  const club = await getDefaultClub();
  const [openDrop, viewer, directory] = await Promise.all([
    getOpenDrop(club),
    getSessionMember(),
    getBrowseDirectory(club.id),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 8 }}>
          Browse music
        </h1>
        <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 20 }}>
          Every artist and song that&rsquo;s been featured here — search below to find a song on
          Spotify{openDrop ? " and submit it as your pick for this cycle." : "."}
        </p>

        <BrowseSearch isLoggedIn={!!viewer} dropOpen={!!openDrop} />

        <div className="label" style={{ margin: "32px 0 12px" }}>
          Artists
        </div>
        {directory.artists.length === 0 ? (
          <p className="mut" style={{ fontSize: 12.5, marginBottom: 20 }}>
            No artists yet — they&rsquo;ll show up here once a drop ships.
          </p>
        ) : (
          <div className="archive-grid" style={{ marginBottom: 32 }}>
            {directory.artists.map((artist) => (
              <ArtistTile key={artist.normalizedName} club={club} artist={artist} />
            ))}
          </div>
        )}

        <div className="label" style={{ margin: "12px 0 12px" }}>
          Songs
        </div>
        {directory.songs.length === 0 ? (
          <p className="mut" style={{ fontSize: 12.5 }}>
            No songs yet — they&rsquo;ll show up here once a drop ships.
          </p>
        ) : (
          <div className="archive-grid">
            {directory.songs.map((song) => (
              <Link
                key={song.songId}
                href={artistHref(song.artist)}
                className="song-tile"
                title={`${song.title} — ${song.artist}`}
              >
                {song.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={song.artworkUrl} alt="" loading="lazy" />
                ) : (
                  <div className="song-tile-empty" aria-hidden="true" />
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

async function ArtistTile({
  club,
  artist,
}: {
  club: Club;
  artist: { normalizedName: string; displayName: string; dropCount: number };
}) {
  const photoUrl = await getOrFetchArtistPhoto(club, artist.normalizedName, artist.displayName);

  return (
    <div className="drop-card-wrap">
      <Link href={artistHref(artist.displayName)} className="drop-card">
        <div className="song-tile">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" loading="lazy" />
          ) : (
            <div className="song-tile-empty" aria-hidden="true" />
          )}
        </div>
        <div className="info">
          <div className="title">{artist.displayName}</div>
          <div className="meta">
            {artist.dropCount} drop{artist.dropCount === 1 ? "" : "s"}
          </div>
        </div>
      </Link>
    </div>
  );
}
