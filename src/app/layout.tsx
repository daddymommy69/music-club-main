import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Music Club",
  description: "A shared playlist, sent to you by text or email.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
