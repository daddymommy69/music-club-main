export function formatDropMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

export function formatDropMeta(date: Date, songCount: number): string {
  const songLabel = songCount === 1 ? "song" : "songs";
  return `${formatDropMonth(date)} · ${songCount} ${songLabel}`;
}
