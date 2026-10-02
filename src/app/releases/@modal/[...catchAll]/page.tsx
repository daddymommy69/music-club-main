// Needed so that client-side navigation away from /releases (e.g. to
// /submit or /) while the modal slot is rendering doesn't leave a stale
// modal mounted — this catch-all matches everything else under this
// slot and renders nothing.
export default function CatchAll() {
  return null;
}
