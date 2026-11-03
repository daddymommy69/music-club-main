import type { Metadata } from "next";
import "./globals.css";
import NowPlayingProvider from "./_components/NowPlayingProvider";
import SiteFooter from "./_components/SiteFooter";
import { SITE_URL } from "@/lib/site";
import { siteCopy } from "@/lib/copy";

export const metadata: Metadata = {
  // lowercase on purpose (2026-10-09 — founder's own ask), matching the
  // in-page wordmark in SiteHeader.tsx, which has always been lowercase.
  title: "project music club",
  description: siteCopy.tagline,
  // Lets Next resolve the absolute image/URL values a per-route
  // generateMetadata sets (drop/[num]/page.tsx's OG cover image, 2026-10-15)
  // without a build warning — those routes already pass full siteUrl()
  // values, so this is mostly a safety net for anything that doesn't.
  metadataBase: new URL(SITE_URL),
};

// Parallel `modal` slot (2026-11-03 — see src/app/@modal/(.)drop/
// [num]/page.tsx's own comment for the full story): plain inline prop
// type, same as src/app/releases/layout.tsx, rather than the generated
// LayoutProps<"/"> this used before adding @modal — that type only
// reflects whatever slots already existed the last time Next generated
// it, so depending on it here would make this file's own types racy
// against when that regeneration happens to run.
export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NowPlayingProvider>{children}</NowPlayingProvider>
        {modal}
        <SiteFooter />
      </body>
    </html>
  );
}
