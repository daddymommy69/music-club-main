"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client wrapper for the drop-detail modal. Dismissal has to work
 * three ways — the ✕ button, Escape, and the browser back button —
 * and stay in sync with the URL. router.back() is what makes all
 * three converge on the same behavior: the ✕ (see CloseButton) and
 * Escape both just trigger a back navigation, undoing the
 * client-side push that opened the intercepted route, and the actual
 * back button does the same thing natively.
 */
export default function DropModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const close = useCallback(() => {
    router.back();
  }, [router]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-sheet gz-sheet" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
