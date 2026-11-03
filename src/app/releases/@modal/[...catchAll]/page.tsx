// Needed so that client-side navigation away from "/" (e.g. to /browse
// or /account) while this slot is rendering doesn't leave a stale
// modal mounted — this catch-all matches everything else under this
// slot and renders nothing. Same reasoning as
// src/app/releases/@modal/[...catchAll]/page.tsx, just for the root
// modal slot below.
export default function CatchAll() {
  return null;
}
