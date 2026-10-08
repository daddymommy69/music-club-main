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
import { getMemberLikedSongs } from "@/lib/songLikes";
import { getLeaderboard } from "@/lib/leaderboard";
import { getPublishedDrops } from "@/lib/archive";
import { getMemberFavorites } from "@/lib/favorites";
import { getMemberDropRatings } from "@/lib/ratings";
import type { Club, Drop } from "@/db/schema";

const LIKED_SONGS_LIMIT = 20;

/**
 * Everything the embedded curator workspace (CuratorToolsPanel) needs,
 * serialized to plain JSON-friendly props — same shape /room's and
 * /overview's page.tsx used to build for RoomBoard/OverviewBoard before
 * those pages were folded into /account (2026-10 account consolidation
 * — see claude/next-build.md).
 */
async function getCuratorToolsProps(club: Club, openDrop: Drop | null): Promise<CuratorToolsPanelProps> {
  const [overview, room, top10Drop] = await Promise.all([
    getOverviewData(club),
    openDrop ? getRoomData(club, openDrop) : Promise.resolve(null),
    getTargetDropForTop10(club.id),
  ]);
  const top10Summary = top10Drop ? await getTop10Summary(top10Drop) : null;
  const top10Visible =
    top10Summary && top10Summary.phase !== "not-shipped" && top10Summary.window ? top10Summary : null;

  // Flat, drop-ordered "this cycle's picks" list (2026-10-08 curator
  // tools redesign, see claude/next-build.md) — replaces the old
  // per-curator Columns/Stream breakdown, which nobody on the team had
  // actually used. room.curators is still the source (one query, same
  // as before), just flattened and re-sorted by when each pick was
  // actually added rather than grouped by who added it.
  const picks = room
    ? room.curators
        .flatMap((c) => c.picks.map((p) => ({ ...p, curatorName: c.curator.name ?? "" })))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({
          id: p.id,
          title: p.title,
          artist: p.artist,
          artworkUrl: p.artworkUrl,
          sourceUrl: p.sourceUrl,
          curatorCredit: p.curatorName,
        }))
    : [];

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
      artworkUrl: p.artworkUrl,
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
    picks,
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
              curatorTools={null}
            />
          </div>
        </main>
      </>
    );
  }

  const openDrop = await getOpenDrop(club);
  const publishedDrops = await getPublishedDrops(club.id);

  const [listenerPick, submissionHistory, likedSongs, leaderboard, favorites, myRatings, curatorTools] =
    await Promise.all([
      openDrop ? getListenerPick(openDrop.id, member.id) : Promise.resolve(null),
      getMemberSubmissionHistory(member.id),
      getMemberLikedSongs(member.id, LIKED_SONGS_LIMIT),
      getLeaderboard(club.id),
      getMemberFavorites(member.id),
      getMemberDropRatings(member.id, publishedDrops.map((d) => d.id)),
      // Only approved curators get the embedded workspace — this is the
      // real server-side gate (AccountBoard's own `member.isCurator`
      // check is just what decides whether to render it, not whether
      // the data exists at all).
      member.isCurator ? getCuratorToolsProps(club, openDrop) : Promise.resolve(null),
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
          curatorTools={curatorTools}
        />
      </main>
    </>
  );
}
