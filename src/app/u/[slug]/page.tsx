import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/app/_components/SiteHeader";
import RoleName from "@/app/_components/RoleName";
import PlayableArt from "@/app/_components/PlayableArt";
import { PlayQueue } from "@/app/_components/NowPlayingProvider";
import { artistHref } from "@/lib/artistLink";
import { getUserProfileData } from "@/lib/userProfile";

export const dynamic = "force-dynamic";

/**
 * A member's public profile page (/u/[slug], 2026-10-19 — founder's own
 * ask, started as "make contributing curators clickable" and grown into
 * "everyone gets a profile" — see claude/next-build.md). Styled like
 * src/app/artist/[name]/page.tsx on purpose (founder: "i like it liek
 * the artsts pages"). Public to any visitor, no login required — same
 * spirit as artist pages. 404s only when no member has this exact
 * slug; unlike artist pages there's a real row behind this one, so an
 * inactive/former-curator's page keeps working exactly the same way as
 * anyone else's (founder: "yes keep it how it is").
 */
export default async function UserProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getUserProfileData(decodeURIComponent(slug));
  if (!profile) notFound();

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 6 }}>
          <RoleName name={profile.name} isCurator={profile.isCurator} />
        </h1>
        {profile.bio?.trim() && (
          <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 12, maxWidth: 480 }}>
            {profile.bio.trim()}
          </p>
        )}
        <p className="mut" style={{ fontSize: 12, marginBottom: 24 }}>
          {profile.dropCount} drop{profile.dropCount === 1 ? "" : "s"} touched · {profile.songCount} song
          {profile.songCount === 1 ? "" : "s"} added
        </p>

        {profile.songs.length > 0 && (
          <>
            <div className="label" style={{ marginBottom: 12 }}>
              Songs
            </div>
            {/* Player revamp pattern, same as artist pages: this user's
                songs are their own queue. */}
            <PlayQueue
              songs={profile.songs.map((s) => ({
                songId: s.songId,
                spotifyUri: s.spotifyUri,
                artworkUrl: s.artworkUrl,
                title: s.title,
                artist: s.artist,
              }))}
            >
              <div className="roster-list" style={{ marginBottom: 32 }}>
                {profile.songs.map((song) => (
                  <div className="roster-row" key={song.songId} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <PlayableArt
                        spotifyUri={song.spotifyUri}
                        artworkUrl={song.artworkUrl}
                        title={song.title}
                        artist={song.artist}
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
                        <div className="mut" style={{ fontSize: 10.5 }}>
                          <Link href={artistHref(song.artist)}>{song.artist}</Link>
                          {song.pickType === "listener" && " · listener pick"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </PlayQueue>
          </>
        )}

        {profile.blurbs.length > 0 && (
          <>
            <div className="label" style={{ marginBottom: 12 }}>
              Notes
            </div>
            <div className="notes-feed">
              {profile.blurbs.map((blurb, i) => (
                <p key={i} className="mut" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>
                  <Link href={`/drop/${blurb.dropNum}`} style={{ fontWeight: 600 }}>
                    Drop {blurb.dropNum}
                  </Link>
                  {blurb.songTitle && <> · {blurb.songTitle}</>}
                  <br />
                  {blurb.text}
                </p>
              ))}
            </div>
          </>
        )}

        {profile.songs.length === 0 && profile.blurbs.length === 0 && (
          <p className="empty-state">Nothing here yet.</p>
        )}
      </main>
    </>
  );
}
