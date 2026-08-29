import { notFound } from "next/navigation";
import DropModalShell from "@/app/_components/DropModalShell";
import DropDetail from "@/app/_components/DropDetail";
import { getDefaultClub } from "@/lib/club";
import { getPublicDrop } from "@/lib/archive";
import { siteDisplayPath } from "@/lib/site";

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

  return (
    <DropModalShell>
      <DropDetail drop={drop} closable shareUrl={siteDisplayPath(`/drop/${drop.num}`)} />
    </DropModalShell>
  );
}
