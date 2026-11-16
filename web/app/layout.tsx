import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import CartCount from "@/components/CartCount";
import "./globals.css";

// Source Sans 3, the Illinois brand's workhorse face (brand.illinois.edu/visual-identity/typography: body copy, and
// headlines in heavier weights), self-hosted by next/font at build time. One family for everything.
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Illini Scheduler", template: "%s | Illini Scheduler" },
  description: "Unofficial UIUC course planner: professors compared by GPA and ratings, sections, gen-eds, a degree checklist and a conflict-free schedule builder.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const NAV: [string, string][] = [
  ["/", "Search"],
  ["/geneds/", "Gen-eds"],
  ["/degree/", "Degree"],
  ["/opened/", "Just opened"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
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
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t-4 border-orange bg-navy text-white">
          <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-4 px-4 py-8 text-sm leading-relaxed sm:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-base font-bold">Illini Scheduler</p>
              <p className="mt-1">
                Unofficial and not affiliated with the University of Illinois. Data comes from public sources and can be out of date: confirm sections,
                seats and restrictions in Self-Service before registering.
              </p>
            </div>
            <div>
              <p className="font-semibold">Where the data comes from</p>
              <p className="mt-1">
                Course Explorer (sections, seats, final exams), the{" "}
                <a className="underline hover:text-orange" href="https://github.com/wadefagen/datasets/tree/main/gpa">
                  UIUC GPA dataset
                </a>
                ,{" "}
                <a className="underline hover:text-orange" href="https://github.com/wadefagen/datasets/tree/main/course-catalog">
                  course catalog
                </a>{" "}
                and{" "}
                <a className="underline hover:text-orange" href="https://github.com/wadefagen/datasets/tree/main/teachers-ranked-as-excellent">
                  Teachers Ranked as Excellent
                </a>{" "}
                datasets by Wade Fagen-Ulmschneider, the{" "}
                <a className="underline hover:text-orange" href="https://catalog.illinois.edu/">
                  Academic Catalog
                </a>{" "}
                for degree requirements, and Rate My Professors.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
