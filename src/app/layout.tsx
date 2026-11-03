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
        {/* 2026-11-03 follow-up — founder's own report: songs stopped
            playing from the new root drop modal. Cause: {modal} was a
            SIBLING of <NowPlayingProvider> below, not a child of it —
            every PlayableArt inside the modal called usePlayer() with
            no provider above it in the tree to find. Has to be inside,
            same as /releases' own modal always has been (it's nested
            under this same provider automatically, being one layout
            level deeper). */}
        <NowPlayingProvider>
          {children}
          {modal}
        </NowPlayingProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
