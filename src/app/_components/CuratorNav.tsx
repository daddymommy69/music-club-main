"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/room", label: "Room" },
  { href: "/overview", label: "Overview" },
  { href: "/settings", label: "Settings" },
];

/** Nav between the two curator-only surfaces. Stands apart from SiteHeader's
 * public nav on purpose — these pages are gated, not part of the public site. */
export default function CuratorNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        gap: 6,
        marginBottom: 22,
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
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
  );
}
