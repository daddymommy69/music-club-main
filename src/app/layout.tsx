import type { Metadata } from "next";
import "./globals.css";
import NowPlayingProvider from "./_components/NowPlayingProvider";
import SiteFooter from "./_components/SiteFooter";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  // lowercase on purpose (2026-10-09 — founder's own ask), matching the
  // in-page wordmark in SiteHeader.tsx, which has always been lowercase.
  title: "project music club",
  description: "curated by jacob & friends",
  // Lets Next resolve the absolute image/URL values a per-route
  // generateMetadata sets (drop/[num]/page.tsx's OG cover image, 2026-10-15)
  // without a build warning — those routes already pass full siteUrl()
  // values, so this is mostly a safety net for anything that doesn't.
  metadataBase: new URL(SITE_URL),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <NowPlayingProvider>{children}</NowPlayingProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
