import SiteHeader from "@/app/_components/SiteHeader";
import AccountAuth from "@/app/_components/AccountAuth";
import AccountBoard from "@/app/_components/AccountBoard";
import { type CuratorToolsPanelProps } from "@/app/_components/CuratorToolsPanel";
import { getDefaultClub } from "@/lib/club";
import { getSessionMember } from "@/lib/memberSession";
import { getOpenDrop, getRoomData } from "@/lib/room";
import { getOverviewData } from "@/lib/overview";
import { getTargetDropForTop10, getTop10Summary } from "@/lib/top10Data";
import { getListenerPick } from "@/lib/listenerPicks";
import { getMemberSubmissionHistory } from "@/lib/memberProfile";
import { getMemberActivity } from "@/lib/activity";
import { getLeaderboard } from "@/lib/leaderboard";
import { getPublishedDrops } from "@/lib/archive";
import { getMemberFavorites } from "@/lib/favorites";
import { getMemberDropRatings } from "@/lib/ratings";
import type { Club, Drop } from "@/db/schema";

const ACTIVITY_LIMIT = 20;

/**
 * Everything the embedded curator workspace (CuratorToolsPanel) needs,
 * serialized to plain JSON-friendly props — same shape /room's and
 * /overview's page.tsx used to build for RoomBoard/OverviewBoard before
 * those pages were folded into /account (2026-10 account consolidation
 * — see claude/next-build.md).
 */
async function getCuratorToolsProps(club: Club, openDrop: Drop | null, meId: number): Promise<CuratorToolsPanelProps> {
  const [overview, room, top10Drop] = await Promise.all([
    getOverviewData(club),
    openDrop ? getRoomData(club, openDrop) : Promise.resolve(null),
    getTargetDropForTop10(club.id),
  ]);
  const top10Summary = top10Drop ? await getTop10Summary(top10Drop) : null;
  const top10Visible =
    top10Summary && top10Summary.phase !== "not-shipped" && top10Summary.window ? top10Summary : null;

  return {
    dropNum: overview.dropNum,
    isManual: overview.isManual,
    daysUntilNext: overview.daysUntilNext,
    hasOpenDrop: overview.hasOpenDrop,
    subscriberCount: overview.subscriberCount,
    pile: overview.pile.map((p) => ({
      id: p.id,
      title: p.title,
      artist: p.artist,
      link: p.link,
      submittedBy: p.submittedBy,
      submittedAt: p.submittedAt.toISOString(),
      pulledAt: p.pulledAt ? p.pulledAt.toISOString() : null,
    })),
    roster: overview.roster.map((c) => ({
      id: c.id,
      name: c.name,
      picksThisCycle: c.picksThisCycle,
      picksLifetime: c.picksLifetime,
      joinedAt: c.joinedAt.toISOString(),
    })),
    meId,
    curators: room
      ? room.curators.map((c) => ({
          id: c.curator.id,
          name: c.curator.name ?? "",
          picks: c.picks.map((p) => ({
            id: p.id,
            title: p.title,
            artist: p.artist,
            sourceUrl: p.sourceUrl,
          })),
          note: c.note,
          lastActivity: c.lastActivity ? c.lastActivity.toISOString() : null,
        }))
      : [],
    comments: room
      ? room.comments.map((c) => ({
          id: c.id,
          curatorId: c.curatorId,
          curatorName: c.curatorName,
          text: c.text,
          createdAt: c.createdAt.toISOString(),
        }))
      : [],
    stream: room
      ? room.stream.map((item) =>
          item.kind === "pick"
            ? {
                kind: "pick" as const,
                at: item.at.toISOString(),
                curatorName: item.curatorName,
                title: item.pick.title,
                artist: item.pick.artist,
              }
            : {
                kind: "note" as const,
                at: item.at.toISOString(),
                curatorName: item.curatorName,
                text: item.text,
              }
        )
      : [],
    shipCandidate: overview.shipCandidate,
    top10: top10Visible
      ? {
          dropNum: top10Visible.dropNum,
          phase: top10Visible.phase as "pending" | "open" | "closed",
          opensAt: top10Visible.window!.opensAt.toISOString(),
          closesAt: top10Visible.window!.closesAt.toISOString(),
          tally: top10Visible.tally,
          hitThreshold: top10Visible.hitThreshold,
          spotifyUrl: top10Visible.spotifyUrl,
          appleUrl: top10Visible.appleUrl,
        }
      : null,
  };
}

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
 * there's no session, personal dashboard once there is one. As of the
 * account-consolidation round, this is ALSO the only place the curator
 * workspace lives — /room and /overview are gone; their functionality
 * is embedded here via CuratorToolsPanel, gated server-side on
 * member.isCurator below. Still explicitly NOT a replacement for
 * /you/:token — that stateless magic-link page stays exactly as-is.
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
              activity={[]}
              leaderboard={leaderboard}
              publishedDrops={publishedDrops.map((d) => ({
                id: d.id,
                num: d.num,
                title: d.title,
                publishedAt: d.publishedAt.toISOString(),
              }))}
              favoriteDropIds={[]}
              myRatings={{}}
              curatorTools={null}
            />
          </div>
        </main>
      </>
    );
  }

  const openDrop = await getOpenDrop(club);
  const publishedDrops = await getPublishedDrops(club.id);

  const [listenerPick, submissionHistory, activity, leaderboard, favorites, myRatings, curatorTools] =
    await Promise.all([
      openDrop ? getListenerPick(openDrop.id, member.id) : Promise.resolve(null),
      getMemberSubmissionHistory(member.id),
      getMemberActivity(member.id, ACTIVITY_LIMIT),
      getLeaderboard(club.id),
      getMemberFavorites(member.id),
      getMemberDropRatings(member.id, publishedDrops.map((d) => d.id)),
      // Only approved curators get the embedded workspace — this is the
      // real server-side gate (AccountBoard's own `member.isCurator`
      // check is just what decides whether to render it, not whether
      // the data exists at all).
      member.isCurator ? getCuratorToolsProps(club, openDrop, member.id) : Promise.resolve(null),
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
          activity={activity.map((row) =>
            row.kind === "song-like"
              ? {
                  kind: "song-like" as const,
                  at: row.at.toISOString(),
                  songId: row.songId,
                  title: row.title,
                  artist: row.artist,
                  dropNum: row.dropNum,
                }
              : {
                  kind: row.kind,
                  at: row.at.toISOString(),
                  dropId: row.dropId,
                  dropNum: row.dropNum,
                  dropTitle: row.dropTitle,
                }
          )}
          leaderboard={leaderboard}
          publishedDrops={publishedDrops.map((d) => ({
            id: d.id,
            num: d.num,
            title: d.title,
            publishedAt: d.publishedAt.toISOString(),
          }))}
          favoriteDropIds={favorites.map((f) => f.dropId)}
          myRatings={Object.fromEntries(myRatings)}
          curatorTools={curatorTools}
        />
      </main>
    </>
  );
}
