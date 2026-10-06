import SiteHeader from "@/app/_components/SiteHeader";
import AccountAuth from "@/app/_components/AccountAuth";
import AccountBoard from "@/app/_components/AccountBoard";
import { getDefaultClub } from "@/lib/club";
import { getSessionMember } from "@/lib/memberSession";
import { getOpenDrop } from "@/lib/room";
import { getListenerPick } from "@/lib/listenerPicks";
import { getMemberSubmissionHistory } from "@/lib/memberProfile";
import { getLeaderboard } from "@/lib/leaderboard";
import { getPublishedDrops } from "@/lib/archive";
import { getMemberFavorites } from "@/lib/favorites";
import { getMemberDropRatings } from "@/lib/ratings";

export const dynamic = "force-dynamic";

// A stand-in for the real `member` row AccountBoard expects, used only
// for the logged-out render below — id 0 never matches a real member,
// and every write action it can trigger (bio save, favorites, ratings,
// a listener pick) requires its own real session server-side regardless
// of what this placeholder says, so there's nothing this id could do.
const PREVIEW_MEMBER = { id: 0, name: null, bio: null, isCurator: false };

/**
 * /account (2026-10 "next build" — see claude/next-build.md): the
 * unified page that works for everyone — signup/login gate when
 * there's no session, personal dashboard once there is one. Explicitly
 * NOT a replacement for /you/:token (the stateless magic-link page
 * stays exactly as-is) or for /room + /overview (the curator-only
 * workspaces this page only links out to — see AccountBoard.tsx for
 * that scoping call).
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
              leaderboard={leaderboard}
              publishedDrops={publishedDrops.map((d) => ({
                id: d.id,
                num: d.num,
                title: d.title,
                publishedAt: d.publishedAt.toISOString(),
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

  const [listenerPick, submissionHistory, leaderboard, favorites, myRatings] = await Promise.all([
    openDrop ? getListenerPick(openDrop.id, member.id) : Promise.resolve(null),
    getMemberSubmissionHistory(member.id),
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
          member={{ id: member.id, name: member.name, bio: member.bio, isCurator: member.isCurator }}
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
            pickType: row.pickType,
            dropNum: row.dropNum,
            dropTitle: row.dropTitle,
            publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
          }))}
          leaderboard={leaderboard}
          publishedDrops={publishedDrops.map((d) => ({
            id: d.id,
            num: d.num,
            title: d.title,
            publishedAt: d.publishedAt.toISOString(),
          }))}
          favoriteDropIds={favorites.map((f) => f.dropId)}
          myRatings={Object.fromEntries(myRatings)}
        />
      </main>
    </>
  );
}
