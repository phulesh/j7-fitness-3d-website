import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-paper-300">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-ink-400 md:flex-row md:justify-between">
        <div>
          <p className="font-display text-lg text-ink-700">Folio</p>
          <p className="mt-1 max-w-sm">
            विषय लिखिए — AI शोध, अध्याय, संदर्भ और 3D किताब तैयार करेगा।
          </p>
        </div>
        <div className="flex gap-8">
          <Link href="/privacy" className="hover:text-ink-700">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink-700">
            Terms
          </Link>
          <Link href="/how-it-works" className="hover:text-ink-700">
            Method
          </Link>
        </div>
      </div>
    </footer>
  );
}
