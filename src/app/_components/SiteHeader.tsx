"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteCopy } from "@/lib/copy";

// "/" itself isn't in this list — it renders the exact same content as
// /releases directly now (2026-10-18, see src/app/page.tsx), so the
// active check below only ever needs to match real routes; landing on
// bare "/" just shows no active tab, which is fine since Releases is
// effectively always "home" either way.
const NAV_ITEMS = [
  { href: "/releases", label: "Releases" },
  { href: "/browse", label: "Browse" },
  { href: "/account", label: "Account" },
  // 2026-10-13 — founder's own ask (see claude/next-build.md's "site
  // clarity" round): wanted in the main nav, not tucked into a footer
  // or the Account page, so it's easy to stumble into.
  { href: "/about", label: "About" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header style={{ padding: "28px 0 0" }}>
      <div className="col" style={{ padding: 0 }}>
        {/* Clickable (2026-10-07 — see claude/next-build.md): the
            founder's own "it should link back to releases from
            everywhere" ask. Always /releases, not "/", since "/" is
            just a redirect to it anyway. */}
        <Link href="/releases" className="wordmark">
          project music club
        </Link>
        <p className="mut" style={{ fontSize: 11.5, marginTop: 4 }}>
          {siteCopy.tagline}
        </p>
        <nav
          style={{
            display: "flex",
            gap: 6,
            marginTop: 18,
            borderBottom: "1px solid var(--ln)",
            paddingBottom: 14,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                style={{
                  position: "relative",
                  fontSize: 11,
                  padding: "6px 10px",
                  borderRadius: 4,
                  color: active ? "var(--accent)" : "var(--mut)",
                  background: active ? "var(--acc-soft)" : "transparent",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
