export function formatDropMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

export function formatDropMeta(date: Date, songCount: number): string {
  const songLabel = songCount === 1 ? "song" : "songs";
  return `${formatDropMonth(date)} · ${songCount} ${songLabel}`;
}

/** Date-only, no time of day (2026-10-08 "drop control" round — see
 * claude/next-build.md) — used for the public "ships on"/"opens on"
 * line on /releases. The cron that actually fires these only checks
 * once a day, so a time-of-day here would promise more precision than
 * the schedule actually has. */
export function formatScheduledDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
