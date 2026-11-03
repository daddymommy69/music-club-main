import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { listPendingCurators } from "@/lib/members";
import { listMemberRoster } from "@/lib/curatorAssignments";
import AdminToolsPanel from "@/app/_components/AdminToolsPanel";
import { NavArrowIcon } from "@/app/_components/icons/ArrowIcons";

export const dynamic = "force-dynamic";

/**
 * Admin Tools hub (2026-11-03 "scoped curator terms" round — see
 * claude/next-build.md: the founder's own ask, a dedicated admin area
 * rather than one panel buried in Settings). Explicitly "just me," same
 * isAdmin-only gate /admin/copy already uses for its whole page, not
 * the isCurator gate every other curator-tools page uses — a plain
 * curator (not also an admin) gets bounced to /account, same as
 * /admin/copy does today.
 *
 * Replaces the curator-grant panel that used to live in SettingsBoard's
 * AdminSection (removed this same round) — granting/revoking and the
 * full member roster live here now, alongside a link to the other
 * existing admin-only tool (/admin/copy).
 */
export default async function AdminToolsPage() {
  const member = await getSessionMember();
  if (!member || !member.isCurator) redirect("/curators");
  if (!member.isAdmin) redirect("/account");

  const club = await getDefaultClub();
  const [roster, pending] = await Promise.all([listMemberRoster(club.id), listPendingCurators(club.id)]);

  return (
    <main className="shell page">
      <div style={{ marginBottom: 18 }}>
        <Link href="/account" className="mut" style={{ fontSize: 11 }}>
          ← Back to account
        </Link>
      </div>

      <p className="label" style={{ marginBottom: 4 }}>
        Admin tools
      </p>
      <p className="mut" style={{ fontSize: 11.5, marginBottom: 20, lineHeight: 1.6 }}>
        Grant curator status for a set number of drops, until a date, for specific drop numbers, or
        with no end date — and see who&rsquo;s currently a curator at a glance.
      </p>

      <AdminToolsPanel initialRoster={roster} initialPending={pending.map((p) => ({ id: p.id, email: p.email, invitedBy: p.invitedBy }))} />

      <div style={{ marginTop: 24 }}>
        <Link href="/admin/copy" className="link-btn">
          Edit site copy <NavArrowIcon />
        </Link>
      </div>
    </main>
  );
}
