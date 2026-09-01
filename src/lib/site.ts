/**
 * The real, deployed domain — needed for any link that leaves the app
 * (release texts/emails, share strings) or is shown as plain text next
 * to a drop. Read from `NEXT_PUBLIC_SITE_URL` rather than hardcoded, so
 * setting it once (in `.env.local` for dev, in Vercel's project env vars
 * for real deploys) is the only place a domain change ever needs to
 * happen — no code edit, no redeploy of a stale link baked into a page.
 * Falls back to localhost so local dev works with nothing set.
 */
const RAW_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Full origin, no trailing slash — e.g. "https://gooberz.club". */
export const SITE_URL = RAW_SITE_URL.replace(/\/+$/, "");

/** Bare host, no protocol — e.g. "gooberz.club". Only for a plain-text
 * display string (the "share this" line under a drop), never a clickable
 * href — use siteUrl() for anything that needs to actually work as a link. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/** A real, absolute URL a text/email link can point at. */
export function siteUrl(path: string): string {
  return `${SITE_URL}${withLeadingSlash(path)}`;
}

/** The same path as a bare "host/path" display string — what a "share
 * this" line shows, not something meant to be clicked as-is. */
export function siteDisplayPath(path: string): string {
  return `${SITE_HOST}${withLeadingSlash(path)}`;
}
