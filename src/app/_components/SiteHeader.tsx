"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Sign up" },
  { href: "/submit", label: "Submit a song" },
  { href: "/archive", label: "Archive" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header style={{ padding: "28px 0 0" }}>
      <div className="col" style={{ padding: 0 }}>
        <div className="wordmark">gooberz music club</div>
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
            const active =
              item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
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
