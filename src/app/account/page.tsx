import SiteHeader from "@/app/_components/SiteHeader";
import AccountAuth from "@/app/_components/AccountAuth";
import AccountBoard from "@/app/_components/AccountBoard";
import RoleName from "@/app/_components/RoleName";
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
    // Public, no-session preview (added 2026-10-06, per the founder's
    // "show what can be on the account page" ask) — the leaderboard
    // doesn't need a login to read (see leaderboard.ts's own comment:
    // "Public to everyone, not curator-only"), so a logged-out visitor
    // gets a real look at it rather than just a blank sign-up box.
    const leaderboard = await getLeaderboard(club.id);

    return (
      <>
        <SiteHeader />
        <main className="col page">
          <h1 style={{ fontSize: 19, letterSpacing: "-0.02em", marginBottom: 20 }}>
            Your account
          </h1>
          <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.65, marginBottom: 20 }}>
            One account for everything: a bio on your profile, this cycle&rsquo;s Listener Pick,
            your full submission history, a favorites showcase of up to 5 past drops, your drop
            ratings, and the leaderboard below.
          </p>
          <AccountAuth />

          {leaderboard.length > 0 && (
            <div style={{ marginTop: 36 }}>
              <div className="label" style={{ marginBottom: 12 }}>
                Leaderboard
              </div>
              <hr className="hairline" style={{ margin: "0 0 4px" }} />
              <div>
                {leaderboard.slice(0, 10).map((row) => (
                  <div key={row.memberId} className="roster-row">
                    <span className="roster-name">
                      <RoleName name={row.name || "Someone"} isCurator={row.isCurator} />
                    </span>
                    <span className="roster-meta">
                      {row.pickCount} pick{row.pickCount === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
