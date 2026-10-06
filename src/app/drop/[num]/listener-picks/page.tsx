import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import SongEmbed from "@/app/_components/SongEmbed";
import RoleName from "@/app/_components/RoleName";
import BuildListenerPlaylistButton from "@/app/_components/BuildListenerPlaylistButton";
import { getDefaultClub } from "@/lib/club";
import { getListenerPicksForDrop } from "@/lib/archive";
import { getSessionMember } from "@/lib/memberSession";
import { formatDropMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

function spotifyTrackUrl(spotifyUri: string | null): string | null {
  if (!spotifyUri) return null;
  const id = spotifyUri.split(":").pop();
  return id ? `https://open.spotify.com/track/${id}` : null;
}

/**
 * A published drop's Listener Picks, pulled off the main drop page
 * entirely (2026-10 release-page redesign — see claude/next-build.md:
 * "still collected... new home is /releases archive as its own
 * separate card per cycle"). Public credit, same as every other public
 * surface — never submittedBy, always the real member name via
 * submittedByMemberId. The playlist build is curator-only, on-demand,
 * never sent out — see BuildListenerPlaylistButton and
 * src/lib/listenerPlaylist.ts.
 */
export default async function ListenerPicksPage({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num } = await params;
  const club = await getDefaultClub();
  const picks = await getListenerPicksForDrop(club.id, Number(num));
  if (!picks) notFound();

  const viewer = await getSessionMember();
  const canBuild = !!viewer && viewer.isCurator && viewer.clubId === club.id;

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <div style={{ marginBottom: 18 }}>
          <Link href={`/drop/${picks.dropNum}`} className="mut" style={{ fontSize: 11 }}>
            ← {picks.title ?? `Drop ${picks.dropNum}`}
          </Link>
        </div>

        <div className="drop-title">Listener Pick playlist</div>
        <div className="mut" style={{ fontSize: 11, marginBottom: 20 }}>
          {formatDropMonth(picks.publishedAt)} · {picks.songs.length}{" "}
          {picks.songs.length === 1 ? "song" : "songs"} · not sent out
        </div>

        <div style={{ marginBottom: 26 }}>
          {picks.listenerPlaylistUrl ? (
            <a
              className="btn btn-outline"
              href={picks.listenerPlaylistUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open playlist on Spotify ↗
            </a>
          ) : canBuild ? (
            <BuildListenerPlaylistButton dropId={picks.dropId} alreadyBuilt={false} />
          ) : (
            <p className="mut" style={{ fontSize: 11.5 }}>
              Not built yet — a curator can build this anytime.
            </p>
          )}
          {picks.listenerPlaylistUrl && canBuild && (
            <div style={{ marginTop: 10 }}>
              <BuildListenerPlaylistButton dropId={picks.dropId} alreadyBuilt={true} />
            </div>
          )}
        </div>

        <div className="tracklist-header">
          <span className="label">The songs</span>
          <span className="label">Picked by</span>
        </div>
        <hr className="hairline" style={{ margin: "0 0 4px" }} />
        <div>
          {picks.songs.map((song) => {
            const spotifyUrl = spotifyTrackUrl(song.spotifyUri);
            return (
              <div className="track-row" key={song.id}>
                <div className="track-row-top">
                  {song.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={song.artworkUrl} alt="" className="track-row-art" />
                  ) : (
                    <div className="track-row-art track-row-art-empty" aria-hidden="true" />
                  )}
                  <div className="track-row-body">
                    <div className="track-info">
                      <div className="track-title">{song.title}</div>
                      <div className="track-artist">{song.artist}</div>
                    </div>
                    <div className="track-credit">
                      <RoleName name={song.credit} isCurator={song.creditIsCurator} />
                    </div>
                  </div>
                </div>
                {spotifyUrl && (
                  <div style={{ marginBottom: 8 }}>
                    <a href={spotifyUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10.5 }}>
                      + Spotify
                    </a>
                  </div>
                )}
                <SongEmbed sourceUrl={song.sourceUrl} />
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
