import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Illini Scheduler", template: "%s · Illini Scheduler" },
  description:
    "Unofficial UIUC course planner: sections, GPA by instructor, offering history, gen-ed finder and a conflict-free schedule builder.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2">
          Skip to content
        </a>
        <header className="border-b border-line bg-navy text-white">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3" aria-label="Main">
            <Link href="/" className="mr-auto text-lg font-bold tracking-tight no-underline">
              Illini <span className="text-orange-300">Scheduler</span>
            </Link>
            <Link href="/" className="text-sm hover:underline">
              Search
            </Link>
            <Link href="/geneds/" className="text-sm hover:underline">
              Gen-ed finder
            </Link>
            <Link href="/schedule/" className="text-sm hover:underline">
              Schedule builder
            </Link>
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-6">
          {children}
        </main>
        <footer className="mx-auto max-w-5xl border-t border-line px-4 py-6 text-xs leading-relaxed text-muted">
          <p>
            <strong>Unofficial.</strong> Not affiliated with the University of Illinois. Data comes from public sources and may be out of
            date: always confirm sections, seats and restrictions in Self-Service before registering.
          </p>
          <p className="mt-1">
            Sources: Course Explorer schedule (via{" "}
            <a className="underline" href="https://github.com/wadefagen/datasets/tree/main/course-catalog">
              wadefagen/datasets course-catalog
            </a>
            ), the{" "}
            <a className="underline" href="https://github.com/wadefagen/datasets/tree/main/gpa">
              UIUC GPA dataset
            </a>{" "}
            and{" "}
            <a className="underline" href="https://github.com/wadefagen/datasets/tree/main/teachers-ranked-as-excellent">
              Teachers Ranked as Excellent
            </a>{" "}
            by Wade Fagen-Ulmschneider, and Rate My Professors (linked, when available).
          </p>
        </footer>
      </body>
    </html>
  );
}
