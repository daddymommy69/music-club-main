"use client";

import { useState } from "react";

export default function SignupForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [wantsText, setWantsText] = useState(true);
  const [wantsEmail, setWantsEmail] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "done" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });

    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, email, wantsText, wantsEmail, smsOptIn }),
    });

    if (res.ok) {
      setStatus({ kind: "done" });
      return;
    }
    const data = await res.json().catch(() => ({}));
    setStatus({ kind: "error", message: data.error ?? "Something went wrong." });
  }

  if (status.kind === "done") {
    return <p className="notice">You&rsquo;re signed up. Watch your phone/inbox for the next drop.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <fieldset>
        <legend>How do you want the playlist?</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={wantsText}
            onChange={(e) => setWantsText(e.target.checked)}
          />
          Text message
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={wantsEmail}
            onChange={(e) => setWantsEmail(e.target.checked)}
          />
          Email
        </label>
      </fieldset>

      {wantsText && (
        <>
          <label>
            Phone number
            <input
              type="tel"
              placeholder="+15551234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required={wantsText}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => setSmsOptIn(e.target.checked)}
              required={wantsText}
            />
            I agree to receive text messages. Reply STOP anytime to unsubscribe.
          </label>
        </>
      )}

      {wantsEmail && (
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required={wantsEmail}
          />
        </label>
      )}

      {status.kind === "error" && <p className="notice error">{status.message}</p>}

      <button type="submit" disabled={status.kind === "loading"}>
        {status.kind === "loading" ? "Signing up…" : "Sign up"}
      </button>
    </form>
  );
}
