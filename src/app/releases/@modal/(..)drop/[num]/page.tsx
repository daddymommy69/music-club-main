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
      />
    </DropModalShell>
  );
}
