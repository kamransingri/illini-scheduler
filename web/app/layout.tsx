import type { Metadata, Viewport } from "next";
import { Montserrat, Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import CartCount from "@/components/CartCount";
import "./globals.css";

// Illinois brand faces (brand.illinois.edu/visual-identity/typography), self-hosted by next/font at build time.
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", weight: ["600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Illini Scheduler", template: "%s | Illini Scheduler" },
  description: "Unofficial UIUC course planner: professors compared by GPA and ratings, sections, gen-eds and a conflict-free schedule builder.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const NAV: [string, string][] = [
  ["/", "Search"],
  ["/geneds/", "Gen-eds"],
  ["/opened/", "Just opened"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${montserrat.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2">
          Skip to content
        </a>
        <header className="border-b-4 border-orange bg-navy text-white">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3" aria-label="Main">
            <Link href="/" className="mr-auto font-display text-lg font-bold no-underline">
              Illini Scheduler
            </Link>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className={`whitespace-nowrap hover:underline ${href === "/" || href === "/opened/" ? "hidden sm:inline" : ""}`}>
                {label}
              </Link>
            ))}
            <Link href="/schedule/" className="whitespace-nowrap hover:underline">
              Schedule
              <CartCount />
            </Link>
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-line bg-panel">
          <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-sm text-muted">
            <p>
              <strong className="text-ink">Unofficial.</strong> Not affiliated with the University of Illinois. Data comes from public sources and can
              be out of date: confirm sections, seats and restrictions in Self-Service before registering.
            </p>
            <p>
              Sources: Course Explorer, the{" "}
              <a className="underline" href="https://github.com/wadefagen/datasets/tree/main/gpa">
                UIUC GPA dataset
              </a>
              ,{" "}
              <a className="underline" href="https://github.com/wadefagen/datasets/tree/main/course-catalog">
                course catalog
              </a>{" "}
              and{" "}
              <a className="underline" href="https://github.com/wadefagen/datasets/tree/main/teachers-ranked-as-excellent">
                Teachers Ranked as Excellent
              </a>{" "}
              datasets by Wade Fagen-Ulmschneider, and Rate My Professors.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
