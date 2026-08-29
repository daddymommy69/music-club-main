"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step =
  | { kind: "destination" }
  | { kind: "joincode"; destination: string }
  | { kind: "profile"; destination: string; joinCode: string; error?: string }
  | { kind: "code"; curatorId: number; masked: string };

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
    const destination = new FormData(e.currentTarget).get("destination")?.toString().trim() ?? "";
    if (!destination) {
      fail("Enter a phone number or email");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/curators/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(data.error ?? "Something went wrong. Try again.");
        return;
      }
      if (data.status === "existing") {
        setStep({ kind: "code", curatorId: data.curatorId, masked: data.masked });
      } else {
        setStep({ kind: "joincode", destination });
      }
    } catch {
      fail("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleJoinCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "joincode") return;
    const joinCode = new FormData(e.currentTarget).get("joinCode")?.toString().trim() ?? "";
    if (!joinCode) {
      fail("Enter your club's join code");
      return;
    }
    setError(null);
    setStep({ kind: "profile", destination: step.destination, joinCode });
  }

  async function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "profile") return;
    const form = new FormData(e.currentTarget);
    const name = form.get("name")?.toString().trim() ?? "";
    const destination = form.get("destination")?.toString().trim() ?? "";

    if (!name) {
      fail("Name is required");
      return;
    }
    if (!destination) {
      fail("Enter a phone number or email");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/curators/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: step.joinCode, name, destination }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Wrong join code and similar server-side failures surface here,
        // where the "wrong code? edit it" link can send them back.
        setStep({ ...step, error: data.error ?? "Something went wrong. Try again." });
        return;
      }
      setStep({ kind: "code", curatorId: data.curatorId, masked: data.masked });
    } catch {
      setStep({ ...step, error: "Something went wrong. Try again." });
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
        body: JSON.stringify({ curatorId: step.curatorId, code }),
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
          Phone or email
          <input name="destination" placeholder="you@example.com" autoFocus />
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

  if (step.kind === "joincode") {
    return (
      <form key="joincode" onSubmit={handleJoinCodeSubmit} className="form gz-up" noValidate>
        <p className="mut" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          Haven&rsquo;t seen you before — enter your club&rsquo;s join code to get started.
        </p>
        <label>
          Join code
          <input name="joinCode" placeholder="GOOBERZ-4821" autoFocus />
        </label>
        {error && (
          <p key={`j-${shakeGen}`} className="notice error gz-shake">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary">
          Continue
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => setStep({ kind: "destination" })}
        >
          ← Back
        </button>
      </form>
    );
  }

  if (step.kind === "profile") {
    return (
      <form key="profile" onSubmit={handleProfileSubmit} className="form gz-up" noValidate>
        <label>
          Your name
          <input name="name" placeholder="This is what shows on your picks and notes" autoFocus />
        </label>
        <label>
          Phone or email
          <input name="destination" defaultValue={step.destination} />
        </label>
        {step.error && (
          <p key={`p-${shakeGen}`} className="notice error gz-shake">
            {step.error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Joining…" : "Join as a curator"}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => setStep({ kind: "joincode", destination: step.destination })}
        >
          ← Wrong code? Edit it
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
