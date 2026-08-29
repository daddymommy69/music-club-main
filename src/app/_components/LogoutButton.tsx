"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="link-btn"
      onClick={async () => {
        await fetch("/api/curators/logout", { method: "POST" });
        router.push("/curators");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
