"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { api, claimLocalCreateDraft } from "@/lib/client";

export default function RegisterPage() {
  const [name, setName] = useState("");
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
      await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
      await claimLocalCreateDraft();
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
        <h1 className="font-display text-3xl">Create account</h1>
        <p className="mt-2 text-sm text-ink-400">
          Already writing? <Link href="/login" className="underline">Sign in</Link>
        </p>
        <form onSubmit={onSubmit} className="paper-card mt-6 space-y-4 rounded-2xl p-6">
          {error && <p className="text-sm text-unsupported">{error}</p>}
          <label className="block text-sm">
            Name
            <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Email
            <input className="field mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Password (8+ characters)
            <input className="field mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
          <button disabled={busy} className="btn-gold w-full min-h-[48px]">
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
      </main>
    </>
  );
}
