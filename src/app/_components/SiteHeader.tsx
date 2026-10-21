"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteCopy } from "@/lib/copy";

// "/" is the real home now (2026-10-18, see src/app/page.tsx — it
// renders ReleasesPageContent directly rather than redirecting), so the
// Releases tab points there, not at /releases — fixed 2026-10-19 after
// the founder reported the URL bar still showing "/releases" even
// though he'd expect bare musicclub.fyi (/releases itself still works
// as its own route, same content either way, just no longer what this
// nav/wordmark link to). Because item.href is now "/" for Releases, the
// plain pathname?.startsWith(item.href) every other tab uses would
// match EVERY path ("/browse".startsWith("/") is true) — the active
// check below special-cases "/" to match only the home routes
// themselves.
const NAV_ITEMS = [
  { href: "/", label: "Releases" },
  { href: "/browse", label: "Browse" },
  { href: "/account", label: "Account" },
  // 2026-10-13 — founder's own ask (see claude/next-build.md's "site
  // clarity" round): wanted in the main nav, not tucked into a footer
  // or the Account page, so it's easy to stumble into.
  { href: "/about", label: "About" },
];

function isActive(pathname: string | null, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "/releases";
  return pathname?.startsWith(href) ?? false;
}

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header style={{ padding: "28px 0 0" }}>
      <div className="col" style={{ padding: 0 }}>
        {/* Clickable (2026-10-07 — see claude/next-build.md): the
            founder's own "it should link back to releases from
            everywhere" ask. Points at "/" now (2026-10-19 fix, see
            NAV_ITEMS comment above), not /releases. */}
        <Link href="/" className="wordmark">
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
            const active = isActive(pathname, item.href);
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
