import { notFound } from "next/navigation";
import SiteHeader from "@/app/_components/SiteHeader";
import DropDetail from "@/app/_components/DropDetail";
import { getDefaultClub } from "@/lib/club";
import { getPublicDrop } from "@/lib/archive";
import { siteDisplayPath } from "@/lib/site";

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

  return (
    <>
      <SiteHeader />
      <main className="col page gz-up">
        <DropDetail drop={drop} shareUrl={siteDisplayPath(`/drop/${drop.num}`)} />
      </main>
    </>
  );
}
