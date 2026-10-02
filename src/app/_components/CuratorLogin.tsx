"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step =
  | { kind: "destination" }
  | { kind: "code"; memberId: number; masked: string };

export default function CuratorLogin() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "destination" });
  const [error, setError] = useState<string | null>(null);
  const [shakeGen, setShakeGen] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  function fail(message: string) {
    setError(message);
    setShakeGen((g) => g + 1);
  }

  async function handleDestinationSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email")?.toString().trim() ?? "";
    if (!email) {
      fail("Enter your email");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/curators/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setStep({ kind: "code", memberId: data.memberId, masked: data.masked });
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "code") return;
    const code = new FormData(e.currentTarget).get("code")?.toString().trim() ?? "";

    if (!/^\d{6}$/.test(code)) {
      fail("Enter all 6 digits");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/curators/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: step.memberId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(data.error ?? "That code isn't right");
        return;
      }
      router.push("/room");
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step.kind === "destination") {
    return (
      <form key="destination" onSubmit={handleDestinationSubmit} className="form gz-up" noValidate>
        <label>
          Email
          <input name="email" type="email" placeholder="you@example.com" autoFocus />
        </label>
        {error && (
          <p key={`d-${shakeGen}`} className="notice error gz-shake">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Checking…" : "Continue"}
        </button>
      </form>
    );
  }

  // step.kind === "code"
  return (
    <form key="code" onSubmit={handleCodeSubmit} className="form gz-up" noValidate>
      <p className="mut" style={{ fontSize: 12.5 }}>
        Enter the code we sent to {step.masked}
      </p>
      <label>
        6-digit code
        <input
          name="code"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          autoFocus
        />
      </label>
      {error && (
        <p key={`c-${shakeGen}`} className="notice error gz-shake">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Verifying…" : "Verify"}
      </button>
      <button
        type="button"
        className="link-btn"
        onClick={() => setStep({ kind: "destination" })}
      >
        ← That&rsquo;s not right
      </button>
    </form>
  );
}
