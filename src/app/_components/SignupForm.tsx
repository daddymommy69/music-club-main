"use client";

import { useState } from "react";
import Link from "next/link";

type FieldErrors = {
  email?: string;
};

type SuccessState = {
  duplicate: boolean;
};

function isValidEmail(s: string) {
  // Deliberately simple — just enough to catch "missing something".
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function SignupForm({
  nextDropNum,
  daysUntilNext,
  isManual,
}: {
  nextDropNum: number;
  daysUntilNext: number | null;
  isManual: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [shakeGen, setShakeGen] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  function clearError(key: keyof FieldErrors) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};

    if (!email.trim()) {
      next.email = "Email address is required";
    } else if (!isValidEmail(email.trim())) {
      next.email = "Check that address — it's missing something";
    }

    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setShakeGen((g) => g + 1);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, wantsText: false, wantsEmail: true }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrors({ email: data.error ?? "Something went wrong. Try again." });
        setShakeGen((g) => g + 1);
        setSubmitting(false);
        return;
      }

      setSuccess({ duplicate: !!data.duplicate });
    } catch {
      setErrors({ email: "Something went wrong. Try again." });
      setShakeGen((g) => g + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    let headline: string;
    let body: string;
    if (success.duplicate) {
      headline = "You're already in.";
      const timing = isManual
        ? "whenever it's ready"
        : daysUntilNext !== null
          ? `in ${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"}`
          : "soon";
      body = `We already have you on the list, so nothing changed. Drop ${nextDropNum} lands ${timing} and you'll get it by email.`;
    } else {
      headline = "You're in! Watch your inbox for the next drop.";
      body = "We'll email you a link the moment it ships — nothing else, ever.";
    }

    return (
      <div className="signup-success gz-up">
        <div className="success-circle gz-pop">✓</div>
        <div className="success-headline">{headline}</div>
        <p className="mut" style={{ fontSize: 13, lineHeight: 1.65 }}>
          {body}
        </p>
        <hr className="hairline" />
        <Link href="/releases" style={{ fontSize: 12.5, display: "block", marginBottom: 8 }}>
          Hear every drop so far →
        </Link>
        <button
          type="button"
          className="link-btn"
          onClick={() => setSuccess(null)}
        >
          {success.duplicate ? "Wrong address? Sign up again" : "Typo? Fix my details"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="form" noValidate>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearError("email");
          }}
        />
      </label>
      {errors.email && (
        <p key={`email-${shakeGen}`} className="notice error gz-shake">
          {errors.email}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? "Signing up…" : "Sign me up"}
      </button>

      <p className="mut" style={{ fontSize: 11, textAlign: "center" }}>
        One playlist a drop. No other mail, ever.
      </p>

      <hr className="hairline" style={{ margin: "4px 0" }} />
      <Link href="/curators" style={{ fontSize: 11.5, textAlign: "center" }}>
        Already a curator? Log in →
      </Link>
    </form>
  );
}
