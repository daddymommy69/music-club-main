// Real host or a proper subdomain of it — NOT a substring match. A plain
// `host.includes("spotify.com")` would also pass "evil-spotify.com" or
// "spotify.com.evil.example".
const ALLOWED_HOSTS = ["spotify.com", "apple.com"];

function isAllowedHost(host: string): boolean {
  return ALLOWED_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
}

/** Shared between the client form and the API route so validation never disagrees. */
export function isValidMusicLink(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  return isAllowedHost(url.hostname.toLowerCase());
}
