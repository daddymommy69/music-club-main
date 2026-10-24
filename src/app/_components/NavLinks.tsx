"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
  /** Small accent dot in the corner — only ever set on "Curator tools"
   * right now, to flag an open drop (2026-10-23 "curator tools revamp"
   * — see claude/next-build.md). */
  badge?: boolean;
};

function isActive(pathname: string | null, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "/releases";
  return pathname?.startsWith(href) ?? false;
}

/**
 * Just the active-link styling pulled out of SiteHeader (2026-10-23 —
 * see that file's own comment) so SiteHeader itself can be an async
 * Server Component that fetches curator/open-drop status, while the
 * one bit that actually needs `usePathname()` stays a small client
 * component underneath it.
 */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        gap: 6,
        marginTop: 18,
        borderBottom: "1px solid var(--ln)",
        paddingBottom: 14,
      }}
    >
      {items.map((item) => {
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
            {item.badge && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 3,
                  right: 3,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent)",
                }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
