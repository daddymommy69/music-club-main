import type { Cycle } from "@/db/schema";

const CLUB_NAME = process.env.NEXT_PUBLIC_CLUB_NAME || "the music club";

export function confirmationSmsBody() {
  return `You're in! Welcome to ${CLUB_NAME}. Every 45 days you'll get the latest shared playlist. Reply STOP anytime to unsubscribe.`;
}

export function confirmationEmailHtml() {
  return `<p>You're in! Welcome to <strong>${CLUB_NAME}</strong>.</p><p>Every 45 days you'll get an email with the latest shared playlist.</p>`;
}

export function releaseSmsBody(cycle: Cycle) {
  const lines = [`New playlist from ${CLUB_NAME} (cycle #${cycle.cycleNumber}):`];
  if (cycle.appleMusicUrl) lines.push(`Apple Music: ${cycle.appleMusicUrl}`);
  if (cycle.spotifyUrl) lines.push(`Spotify: ${cycle.spotifyUrl}`);
  lines.push("Reply STOP to unsubscribe.");
  return lines.join("\n");
}

export function releaseEmailHtml(cycle: Cycle) {
  const parts = [`<p>New playlist from <strong>${CLUB_NAME}</strong> (cycle #${cycle.cycleNumber}):</p>`];
  if (cycle.appleMusicUrl) {
    parts.push(`<p><a href="${cycle.appleMusicUrl}">Listen on Apple Music</a></p>`);
  }
  if (cycle.spotifyUrl) {
    parts.push(`<p><a href="${cycle.spotifyUrl}">Listen on Spotify</a></p>`);
  }
  if (cycle.writeUp) {
    parts.push(`<p>${cycle.writeUp}</p>`);
  }
  return parts.join("\n");
}
