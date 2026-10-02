"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// "/" itself isn't in this list — it just redirects to /releases (the
// site's home since 2026-10), so the active check below only ever
// needs to match real routes.
const NAV_ITEMS = [
  { href: "/releases", label: "Releases" },
  { href: "/submit", label: "Submit a song" },
  { href: "/signup", label: "Sign up" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header style={{ padding: "28px 0 0" }}>
      <div className="col" style={{ padding: 0 }}>
        <div className="wordmark">project music club</div>
        <p className="mut" style={{ fontSize: 11.5, marginTop: 4 }}>
          A shared playlist, sent to you.
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
      </div>
    </header>
  );
}
