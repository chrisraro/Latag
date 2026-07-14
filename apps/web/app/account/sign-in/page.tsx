"use client";

import { useState, useTransition, type FormEvent } from "react";
import { requestOtp, verifyOtp } from "../actions";

type Step = "email" | "code";

export default function SignInPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSendCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestOtp(email);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setStep("code");
    });
  }

  function handleVerify(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // On success, verifyOtp redirects server-side and never returns here.
      const result = await verifyOtp(email, code);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  function handleResend() {
    setError(null);
    startTransition(async () => {
      const result = await requestOtp(email);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  function handleUseDifferentEmail() {
    setError(null);
    setCode("");
    setStep("email");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-md flex-col justify-center px-5 py-14">
      <h1 className="display-black text-3xl uppercase text-ink">Sign in</h1>
      <p className="mt-3 text-inkdim">We&rsquo;ll email you a 6-digit code — no password needed.</p>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-hairline bg-surface1 p-6">
        {step === "email" ? (
          <form onSubmit={handleSendCode} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-2 text-sm text-inkdim">
              Email address
              <input
                type="email"
                name="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="h-12 rounded-xl border border-hairline bg-surface2 px-4 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-acid"
              />
            </label>
            <button
              type="submit"
              disabled={pending || !email.trim()}
              className="display inline-flex h-12 items-center justify-center rounded-full bg-acid px-6 text-[14px] uppercase tracking-wide text-acidink transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-4" noValidate>
            <p className="text-sm text-inkdim">
              Email sent to <span className="text-ink">{email}</span> — click the sign-in link in it, or enter the code below if your email shows one.
            </p>
            <label className="flex flex-col gap-2 text-sm text-inkdim">
              6-digit code
              <input
                type="text"
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="tnum h-16 rounded-xl border border-hairline bg-surface2 px-4 text-center text-3xl tracking-[0.5em] text-ink outline-none focus-visible:outline-2 focus-visible:outline-acid"
              />
            </label>
            <button
              type="submit"
              disabled={pending || code.length !== 6}
              className="display inline-flex h-12 items-center justify-center rounded-full bg-acid px-6 text-[14px] uppercase tracking-wide text-acidink transition-transform focus-visible:outline-2 focus-visible:outline-acid active:scale-[0.98] disabled:opacity-60"
            >
              {pending ? "Verifying…" : "Verify"}
            </button>
            <div className="flex items-center justify-between gap-4 text-sm">
              <button
                type="button"
                onClick={handleUseDifferentEmail}
                className="inline-flex min-h-11 items-center text-inkdim underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-acid"
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={pending}
                className="inline-flex min-h-11 items-center text-inkdim underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-acid disabled:opacity-60"
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
