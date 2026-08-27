import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Music Club",
  description: "Sign up to get the shared playlist every 45 days.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
