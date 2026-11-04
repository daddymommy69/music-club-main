import { notFound } from "next/navigation";
import DropModalShell from "@/app/_components/DropModalShell";
import DropDetail from "@/app/_components/DropDetail";
import { getDefaultClub } from "@/lib/club";
import { getPublicDrop } from "@/lib/archive";
import { siteUrl } from "@/lib/site";
import { getSessionMember } from "@/lib/memberSession";
import { getMemberLikedSongIds } from "@/lib/songLikes";
import { getMemberDropRating } from "@/lib/ratings";
import { getMemberSongRatings } from "@/lib/songRatings";
import { getMemberLikedDropIds } from "@/lib/dropLikes";
import { getMemberSavedDropIds } from "@/lib/dropSaves";

export const dynamic = "force-dynamic";

/**
 * Root-level twin of src/app/releases/@modal/(..)drop/[num]/page.tsx
 * (2026-11-03 — founder's own report: clicking a drop from the home
 * page opened the full /drop/[num] page instead of popping up as a
 * modal). "/" renders the exact same content as "/releases"
 * (src/app/page.tsx, 2026-10-18's "make '/' the real home" round) but
 * is its OWN route segment with its OWN layout chain — it never passes
 * through releases/layout.tsx, so releases' own @modal slot never
 * applied here at all. This is that same slot, duplicated one level up
 * so clicking a drop from "/" intercepts too.
 *
 * `(.)drop` not `(..)drop` — this slot sits directly in src/app/ (the
 * root segment itself), and drop/[num] is a direct child of that same
 * root segment, same "same level" case the framework's own docs use
 * for a root-level `@auth/(.)login` modal. Releases' own version uses
 * `(..)` instead because ITS slot sits one file-system level deeper
 * (inside src/app/releases/) while still needing to reach a sibling of
 * releases, not a child of it — see that file's own comment.
 */
export default async function InterceptedDropModal({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num } = await params;
  const club = await getDefaultClub();
  const drop = await getPublicDrop(club.id, Number(num));
  if (!drop) notFound();

  const viewer = await getSessionMember();
  const songIds = drop.songs.map((s) => s.id);
  const [likedSongIds, viewerRating, viewerDropLiked, viewerDropSaved, viewerSongRatings] = viewer
    ? await Promise.all([
        getMemberLikedSongIds(viewer.id, songIds).then((set) => [...set]),
        getMemberDropRating(drop.id, viewer.id),
        getMemberLikedDropIds(viewer.id, [drop.id]).then((set) => set.has(drop.id)),
        getMemberSavedDropIds(viewer.id, [drop.id]).then((set) => set.has(drop.id)),
        getMemberSongRatings(viewer.id, songIds).then((map) => Object.fromEntries(map)),
      ])
    : [[], null, false, false, {}];
  const viewerSpotifyConnected = viewer ? !!viewer.spotifyRefreshToken : null;

  return (
    <DropModalShell>
      <DropDetail
        drop={drop}
        closable
        shareUrl={siteUrl(`/drop/${drop.num}`)}
        likedSongIds={likedSongIds}
        viewerRating={viewerRating}
        viewerDropLiked={viewerDropLiked}
        viewerDropSaved={viewerDropSaved}
        viewerSongRatings={viewerSongRatings}
        viewerSpotifyConnected={viewerSpotifyConnected}
      />
    </DropModalShell>
  );
}
