"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";

type User = { id: string; name: string; email: string; isGuest: boolean } | null;

export function Header() {
  const [user, setUser] = useState<User>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
    setOpen(false);
  }, [path]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-paper-300/80 bg-paper-200/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-700 text-gold-200 font-display text-lg">F</span>
          <span className="font-display text-xl tracking-tight">Folio</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-ink-400 md:flex">
          <Link href="/#how" className="hover:text-ink-700">
            How it works
          </Link>
          <Link href="/dashboard" className="hover:text-ink-700">
            My ebooks
          </Link>
          <Link href="/create" className="hover:text-ink-700">
            New book
          </Link>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user && !user.isGuest ? (
            <>
              <span className="max-w-[10rem] truncate text-sm text-ink-400">{user.name}</span>
              <button onClick={logout} className="btn-ghost !py-1.5 !px-3 text-xs">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost !py-1.5 !px-4 text-xs">
                Sign in
              </Link>
              <Link href="/register" className="btn-gold !py-1.5 !px-4 text-xs">
                Create account
              </Link>
            </>
          )}
        </div>

        <button className="md:hidden p-2" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="border-t border-paper-300 bg-paper-100 px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3 text-sm">
            <Link href="/#how">How it works</Link>
            <Link href="/dashboard">My ebooks</Link>
            <Link href="/create">New book</Link>
            {user && !user.isGuest ? (
              <button onClick={logout} className="text-left">
                Sign out
              </button>
            ) : (
              <>
                <Link href="/login">Sign in</Link>
                <Link href="/register">Create account</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
