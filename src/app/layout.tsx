import type { Metadata } from "next";
import "./globals.css";
import NowPlayingProvider from "./_components/NowPlayingProvider";

export const metadata: Metadata = {
  // lowercase on purpose (2026-10-09 — founder's own ask), matching the
  // in-page wordmark in SiteHeader.tsx, which has always been lowercase.
  title: "project music club",
  description: "A shared playlist, sent to your inbox.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <NowPlayingProvider>{children}</NowPlayingProvider>
      </body>
    </html>
  );
}
