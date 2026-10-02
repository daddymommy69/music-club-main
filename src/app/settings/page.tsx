import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { isCycleValue } from "@/lib/cycle";
import CuratorNav from "@/app/_components/CuratorNav";
import LogoutButton from "@/app/_components/LogoutButton";
import SettingsBoard from "@/app/_components/SettingsBoard";

export const dynamic = "force-dynamic";

// #/settings (design-handoff.md §9): club rename, the cycle picker, and
// the join code. Curator-gated the same way as /room and /overview —
// this changes what every subscriber-facing countdown shows.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ spotify?: string }>;
}) {
  const curator = await getSessionMember();
  if (!curator || !curator.isCurator) redirect("/curators");

  const club = await getDefaultClub();
  // Defensive fallback only — the DB column is constrained to the same
  // enum, so this should never actually miss.
  const cycle = isCycleValue(club.cycle) ? club.cycle : "manual";
  const { spotify: spotifyStatus } = await searchParams;

  return (
    <main className="shell page">
      <Link href="/" className="wordmark" style={{ display: "block", marginBottom: 4 }}>
        {club.name}
      </Link>
      <p className="mut" style={{ fontSize: 11.5, marginBottom: 16 }}>
        Settings
      </p>
      <CuratorNav />

      <SettingsBoard
        clubName={club.name}
        cycle={cycle}
        cycleCustomDays={club.cycleCustomDays}
        joinCode={club.joinCode}
        spotifyConnected={club.spotifyRefreshToken != null}
        spotifyCallbackStatus={spotifyStatus ?? null}
      />

      <div style={{ marginTop: 28 }}>
        <LogoutButton />
      </div>
    </main>
  );
}
