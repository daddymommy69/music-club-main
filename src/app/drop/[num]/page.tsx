import { notFound } from "next/navigation";
import SiteHeader from "@/app/_components/SiteHeader";
import DropDetail from "@/app/_components/DropDetail";
import { getDefaultClub } from "@/lib/club";
import { getPublicDrop } from "@/lib/archive";
import { siteDisplayPath } from "@/lib/site";
import { getSessionMember } from "@/lib/memberSession";
import { getMemberLikedSongIds } from "@/lib/songLikes";
import { getMemberDropRating } from "@/lib/ratings";
import { getMemberLikedDropIds } from "@/lib/dropLikes";
import { getMemberSavedDropIds } from "@/lib/dropSaves";

export const dynamic = "force-dynamic";

export default async function DropPage({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num } = await params;
  const club = await getDefaultClub();
  const drop = await getPublicDrop(club.id, Number(num));
  if (!drop) notFound();

  // Logged-out viewers get no liked/rated/saved state — LikeButton,
  // RateDropControl, DropLikeButton, and DropSaveButton all still work
  // for them, see their own comments.
  const viewer = await getSessionMember();
  const songIds = drop.songs.map((s) => s.id);
  const [likedSongIds, viewerRating, viewerDropLiked, viewerDropSaved] = viewer
    ? await Promise.all([
        getMemberLikedSongIds(viewer.id, songIds).then((set) => [...set]),
        getMemberDropRating(drop.id, viewer.id),
        getMemberLikedDropIds(viewer.id, [drop.id]).then((set) => set.has(drop.id)),
        getMemberSavedDropIds(viewer.id, [drop.id]).then((set) => set.has(drop.id)),
      ])
    : [[], null, false, false];

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <DropDetail
          drop={drop}
          shareUrl={siteDisplayPath(`/drop/${drop.num}`)}
          likedSongIds={likedSongIds}
          viewerRating={viewerRating}
          viewerDropLiked={viewerDropLiked}
          viewerDropSaved={viewerDropSaved}
        />
      </main>
    </>
  );
}
