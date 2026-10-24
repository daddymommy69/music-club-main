import Link from "next/link";
import { siteCopy } from "@/lib/copy";
import { getSessionMember } from "@/lib/memberSession";
import { getDefaultClub } from "@/lib/club";
import { getOpenDrop } from "@/lib/room";
import NavLinks, { type NavItem } from "./NavLinks";

// "/" is the real home now (2026-10-18, see src/app/page.tsx — it
// renders ReleasesPageContent directly rather than redirecting), so the
// Releases tab points there, not at /releases — fixed 2026-10-19 after
// the founder reported the URL bar still showing "/releases" even
// though he'd expect bare musicclub.fyi (/releases itself still works
// as its own route, same content either way, just no longer what this
// nav/wordmark link to). NavLinks' own isActive special-cases "/" to
// match only the home routes themselves, since every other tab's plain
// pathname.startsWith(item.href) would otherwise match every path.
const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Releases" },
  { href: "/browse", label: "Browse" },
  { href: "/account", label: "Account" },
  // 2026-10-13 — founder's own ask (see claude/next-build.md's "site
  // clarity" round): wanted in the main nav, not tucked into a footer
  // or the Account page, so it's easy to stumble into.
  { href: "/about", label: "About" },
];

/**
 * Async Server Component (2026-10-23 "curator tools revamp" — see
 * claude/next-build.md) so it can decide, server-side, whether to show
 * the new "Curator tools" nav item — the same gate the old buried
 * Account → Curator-tools sub-tab used (member.isCurator), now checked
 * here instead so a non-curator never even sees the tab exists. The dot
 * badge lights up exactly when a drop is currently open, same signal
 * CuratorToolsPanel's own Overview tab uses. Only the active-link
 * styling actually needs the pathname, so that part alone stays a
 * small client component (NavLinks) underneath this.
 */
export default async function SiteHeader() {
  const member = await getSessionMember();

  let items = BASE_NAV_ITEMS;
  if (member?.isCurator) {
    const club = await getDefaultClub();
    const openDrop = await getOpenDrop(club);
    items = [...BASE_NAV_ITEMS, { href: "/curator", label: "Curator tools", badge: !!openDrop }];
  }

  return (
    <header style={{ padding: "28px 0 0" }}>
      <div className="col" style={{ padding: 0 }}>
        {/* Clickable (2026-10-07 — see claude/next-build.md): the
            founder's own "it should link back to releases from
            everywhere" ask. Points at "/" now (2026-10-19 fix, see
            BASE_NAV_ITEMS comment above), not /releases. */}
        <Link href="/" className="wordmark">
          project music club
        </Link>
        <p className="mut" style={{ fontSize: 11.5, marginTop: 4 }}>
          {siteCopy.tagline}
        </p>
        <NavLinks items={items} />
      </div>
    </header>
  );
}
