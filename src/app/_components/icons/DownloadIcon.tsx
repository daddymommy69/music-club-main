/* Plain geometric download icon — same clean-line family as the
 * Play/Pause/Shuffle icons in NowPlayingProvider.tsx, deliberately NOT
 * the squiggle+comet style ArrowIcons.tsx uses (that motif is reserved
 * for the external-link/nav arrows specifically — see this round's
 * own notes). Used on the curator "Drop options" list's Download
 * button (2026-10-27 round — founder's own ask for a redesign, didn't
 * like the plain underlined text link it replaces).
 */
export default function DownloadIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v11" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19h15" />
    </svg>
  );
}
