/* ---------- Custom site arrows — replace plain "↗" / "→" characters ----------
 *
 * ExternalArrowIcon: for links that leave the site (Spotify, Apple Music,
 * Share, etc.) — squiggly shaft + a bracket corner, like a stylized ↗.
 *
 * NavArrowIcon: for in-site navigation / actions (log in, view profile,
 * expand, go to another page) — same squiggle rhythm, but a lined chevron
 * tip instead of a bracket, since nothing opens elsewhere. Pass
 * direction="left" to flip it for "back" links.
 *
 * Both inherit color via `currentColor` so they pick up whatever color the
 * surrounding text/button already has (including the brand-colored Spotify/
 * Apple Music buttons), and work in both light and dark theme.
 */

type ArrowIconProps = {
  size?: number;
  className?: string;
};

export function ExternalArrowIcon({ size = 13, className }: ArrowIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`arrow-icon${className ? ` ${className}` : ""}`}
    >
      <path d="M6 18 Q9.5 18.5 9 15 Q8.5 11.5 12 12 Q14.5 11.5 15 9 Q16.2 7.2 18 6" />
      <path d="M10 6 H18 V14" />
      <path
        d="M20 1.4 L20.5 2.7 L21.8 3.2 L20.5 3.7 L20 5 L19.5 3.7 L18.2 3.2 L19.5 2.7 Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function NavArrowIcon({
  size = 13,
  className,
  direction = "right",
}: ArrowIconProps & { direction?: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`arrow-icon${className ? ` ${className}` : ""}`}
      style={direction === "left" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M2 12 Q4 9 6 12 Q8 15 10 12 Q12 10.5 13.5 12 Q15 12.5 16.5 12" />
      <path d="M16.5 8.8 L20.5 12 L16.5 15.2" />
      <path
        d="M22.6 10.9 L23 11.7 L23.9 12 L23 12.3 L22.6 13.1 L22.2 12.3 L21.3 12 L22.2 11.7 Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
