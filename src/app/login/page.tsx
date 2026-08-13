"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { api } from "@/lib/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      router.push("/ebooks");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-display text-3xl">Sign in</h1>
        <p className="mt-2 text-sm text-ink-400">
          New here? <Link href="/register" className="underline">Create an account</Link>
        </p>
        <form onSubmit={onSubmit} className="paper-card mt-6 space-y-4 rounded-2xl p-6">
          {error && <p className="text-sm text-unsupported">{error}</p>}
          <label className="block text-sm">
            Email
            <input className="field mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Password
            <input className="field mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button disabled={busy} className="btn-gold w-full min-h-[48px]">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </>
  );
}
