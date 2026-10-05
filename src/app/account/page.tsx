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
    return (
      <>
        <SiteHeader />
        <main className="col page">
          <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 20 }}>
            Your account
          </h1>
          <AccountAuth />
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
