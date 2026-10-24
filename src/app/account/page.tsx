import SiteHeader from "@/app/_components/SiteHeader";
import AccountAuth from "@/app/_components/AccountAuth";
import AccountBoard from "@/app/_components/AccountBoard";
import { getDefaultClub } from "@/lib/club";
import { getSessionMember } from "@/lib/memberSession";
import { getOpenDrop } from "@/lib/room";
import { getListenerPick } from "@/lib/listenerPicks";
import { getMemberSubmissionHistory } from "@/lib/memberProfile";
import { getMemberLikedSongs } from "@/lib/songLikes";
import { getLeaderboard } from "@/lib/leaderboard";
import { getPublishedDrops } from "@/lib/archive";
import { getMemberFavorites } from "@/lib/favorites";
import { getMemberDropRatings } from "@/lib/ratings";

const LIKED_SONGS_LIMIT = 20;

export const dynamic = "force-dynamic";

// A stand-in for the real `member` row AccountBoard expects, used only
// for the logged-out render below — id 0 never matches a real member,
// and every write action it can trigger (bio save, favorites, ratings,
// a listener pick) requires its own real session server-side regardless
// of what this placeholder says, so there's nothing this id could do.
const PREVIEW_MEMBER = { id: 0, name: null, bio: null, slug: null, isCurator: false, spotifyConnected: false };

/**
 * /account (2026-10 "next build" — see claude/next-build.md): the
 * unified page that works for everyone — signup/login gate when
 * there's no session, personal dashboard once there is one. The
 * embedded curator workspace that used to live here as a sub-tab moved
 * out to its own /curator page (2026-10-23 "curator tools revamp" —
 * see claude/next-build.md), so this page is back to being purely the
 * plain-member view for everyone, curators included. Still explicitly
 * NOT a replacement for /you/:token — that stateless magic-link page
 * stays exactly as-is.
 */
export default async function AccountPage() {
  const club = await getDefaultClub();
  const member = await getSessionMember();

  if (!member) {
    // Full-layout, logged-out preview (revised 2026-10-06, per the
    // founder's "show the real page, not a description" ask — he wants
    // to see what each section actually looks like before logging in,
    // to judge the page's look while iterating on it). Renders the
    // exact same AccountBoard a signed-in member sees, fed real public
    // data where it exists (the open drop, the shipped-drops list, the
    // leaderboard — none of that is private) and empty-state data for
    // everything that's genuinely per-member (no pick, no submission
    // history, no favorites marked, no ratings) since there's no real
    // member to show those for. AccountBoard's own sections already
    // render a plain "nothing yet" message for each empty case, so this
    // naturally looks like a fresh account rather than a broken one.
    // The write actions inside it (save bio, mark a favorite, rate a
    // drop, submit a pick) still each call their own API route, and
    // every one of those requires its own real session — so clicking
    // around here can't actually change anything; it just won't persist.
    const [openDrop, leaderboard, publishedDrops] = await Promise.all([
      getOpenDrop(club),
      getLeaderboard(club.id),
      getPublishedDrops(club.id),
    ]);

    return (
      <>
        <SiteHeader />
        <main className="col page">
          <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 20 }}>
            Your account
          </h1>
          <AccountAuth />

          <div style={{ marginTop: 36 }}>
            <AccountBoard
              member={PREVIEW_MEMBER}
              openDrop={openDrop ? { num: openDrop.num, title: openDrop.title } : null}
              listenerPick={null}
              submissionHistory={[]}
              likedSongs={[]}
              leaderboard={leaderboard}
              publishedDrops={publishedDrops.map((d) => ({
                id: d.id,
                num: d.num,
                title: d.title,
                publishedAt: d.publishedAt.toISOString(),
                artworkUrls: d.artworkUrls,
              }))}
              favoriteDropIds={[]}
              myRatings={{}}
            />
          </div>
        </main>
      </>
    );
  }

  const openDrop = await getOpenDrop(club);
  const publishedDrops = await getPublishedDrops(club.id);

  const [listenerPick, submissionHistory, likedSongs, leaderboard, favorites, myRatings] = await Promise.all([
    openDrop ? getListenerPick(openDrop.id, member.id) : Promise.resolve(null),
    getMemberSubmissionHistory(member.id),
    getMemberLikedSongs(member.id, LIKED_SONGS_LIMIT),
    getLeaderboard(club.id),
    getMemberFavorites(member.id),
    getMemberDropRatings(member.id, publishedDrops.map((d) => d.id)),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="col page">
        <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 20 }}>
          Your account
        </h1>
        <AccountBoard
          member={{
            id: member.id,
            name: member.name,
            bio: member.bio,
            slug: member.slug,
            isCurator: member.isCurator,
            spotifyConnected: !!member.spotifyRefreshToken,
          }}
          openDrop={openDrop ? { num: openDrop.num, title: openDrop.title } : null}
          listenerPick={
            listenerPick
              ? {
                  title: listenerPick.title,
                  artist: listenerPick.artist,
                  sourceUrl: listenerPick.sourceUrl,
                }
              : null
          }
          submissionHistory={submissionHistory.map((row) => ({
            songId: row.songId,
            title: row.title,
            artist: row.artist,
            artworkUrl: row.artworkUrl,
            spotifyUri: row.spotifyUri,
            pickType: row.pickType,
            dropNum: row.dropNum,
            dropTitle: row.dropTitle,
            publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
          }))}
          likedSongs={likedSongs.map((song) => ({
            songId: song.songId,
            title: song.title,
            artist: song.artist,
            artworkUrl: song.artworkUrl,
            dropNum: song.dropNum,
          }))}
          leaderboard={leaderboard}
          publishedDrops={publishedDrops.map((d) => ({
            id: d.id,
            num: d.num,
            title: d.title,
            publishedAt: d.publishedAt.toISOString(),
            artworkUrls: d.artworkUrls,
          }))}
          favoriteDropIds={favorites.map((f) => f.dropId)}
          myRatings={Object.fromEntries(myRatings)}
        />
      </main>
    </>
  );
}
