import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/app/_components/SiteHeader";
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
 * Per-drop link-preview metadata (2026-10-15 — founder's own report:
 * sharing a drop link showed the site's static "project music club"
 * title everywhere, not which drop it even was). Title is "Drop N" or
 * "Drop N — Title" when one's set, dynamic per drop rather than
 * hard-coded — same getPublicDrop() the page itself uses, so this
 * never drifts from what's actually published. The OG/Twitter image
 * reuses the existing /api/drops/[num]/cover route (same artwork
 * collage already used for the release email and the Spotify playlist
 * cover) so a shared link previews with real art instead of nothing.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ num: string }>;
}): Promise<Metadata> {
  const { num } = await params;
  const club = await getDefaultClub();
  const drop = await getPublicDrop(club.id, Number(num));
  if (!drop) return {};

  const name = drop.title ? `Drop ${drop.num} — ${drop.title}` : `Drop ${drop.num}`;
  const description = `${drop.songs.length} song${drop.songs.length === 1 ? "" : "s"}, picked by the club.`;
  const coverUrl = siteUrl(`/api/drops/${drop.num}/cover`);
  const pageUrl = siteUrl(`/drop/${drop.num}`);

  return {
    title: name,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: name,
      description,
      url: pageUrl,
      siteName: "project music club",
      images: [{ url: coverUrl, width: 800, height: 800 }],
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description,
      images: [coverUrl],
    },
  };
}

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
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <DropDetail
          drop={drop}
          shareUrl={siteUrl(`/drop/${drop.num}`)}
          likedSongIds={likedSongIds}
          viewerRating={viewerRating}
          viewerDropLiked={viewerDropLiked}
          viewerDropSaved={viewerDropSaved}
          viewerSongRatings={viewerSongRatings}
        />
      </main>
    </>
  );
}
