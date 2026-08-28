"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Truck, UserPlus } from "lucide-react";
import { signUpWithPassword } from "@/lib/auth";
import PasswordInput from "@/components/PasswordInput";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { hasSession } = await signUpWithPassword(email, password, orgName);
      if (hasSession) {
        // See login/page.tsx: no router.refresh() needed here either — same reasoning.
        router.push("/");
      } else {
        setAwaitingConfirmation(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="glass-panel w-full max-w-sm p-8 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300">
            <CheckCircle2 size={22} />
          </span>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Check your email</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            We sent a confirmation link to <span className="font-medium text-slate-700 dark:text-slate-200">{email}</span>.
            Click it to activate your account and your new fleet workspace.
          </p>
          <Link href="/login" className="btn-secondary mt-6 inline-flex">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="glass-panel w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow">
            <Truck size={22} />
          </span>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Create your fleet workspace</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Your data stays private to your organization</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-text" htmlFor="orgName">Company / Fleet Name</label>
            <input
              id="orgName"
              type="text"
              required
              className="input-field"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your Fleet Pvt. Ltd."
            />
          </div>
          <div>
            <label className="label-text" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@fleet.com"
            />
          </div>
          <div>
            <label className="label-text" htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            Sign up
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
