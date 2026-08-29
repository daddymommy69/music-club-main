"use client";

import { useRouter } from "next/navigation";

/**
 * The ✕ dismissal for the drop modal. Escape and the browser back
 * button are wired up in DropModalShell; this covers the third way,
 * and all three converge on the same router.back() so the modal state
 * and the URL never fall out of sync.
 */
export default function CloseButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="close-btn"
      onClick={() => router.back()}
      aria-label="Close"
    >
      ✕
    </button>
  );
}
