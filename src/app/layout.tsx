import type { Metadata } from "next";
import "./globals.css";
import NowPlayingProvider from "./_components/NowPlayingProvider";

export const metadata: Metadata = {
  title: "Project Music Club",
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
