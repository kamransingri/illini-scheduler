import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import Logo from "@/components/Logo";
import SiteNav from "@/components/SiteNav";
import { getReleases } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { NAV } from "@/lib/nav";
import pkg from "../package.json";
import "./globals.css";

// Source Sans 3, the Illinois brand's workhorse face (brand.illinois.edu/visual-identity/typography: body copy, and
// headlines in heavier weights), self-hosted by next/font at build time. One family for everything.
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Illini Scheduler", template: "%s | Illini Scheduler" },
  description: "Unofficial UIUC course planner: professors compared by GPA and ratings, sections, gen-eds, a degree checklist and a conflict-free schedule builder.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The footer names the live version and links the ones before it to the Versions page (CHANGELOG.md).
  const released = getReleases().filter((r) => r.version !== "Unreleased");
  const current = released.find((r) => r.version === pkg.version);
  const earlier = released.filter((r) => r.version !== pkg.version && !r.version.includes("-")).slice(0, 3);
  return (
    <html lang="en" className={sourceSans.variable}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2">
          Skip to content
        </a>
        <SiteNav />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t-4 border-orange bg-navy text-white">
          <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-6 px-4 py-8 text-sm leading-relaxed sm:grid-cols-2 lg:grid-cols-[1.1fr_0.7fr_1.4fr]">
            <div>
              <Logo />
              <p className="mt-3">
                Unofficial and not affiliated with the University of Illinois. Data comes from public sources and can be out of date: confirm sections,
                seats and restrictions in Self-Service before registering.
              </p>
              <div className="mt-3" data-testid="site-version">
                <p>
                  <Link className="font-semibold underline-offset-2 hover:text-orange hover:underline" href={`/versions/#v${pkg.version}`}>
                    Version {pkg.version}
                  </Link>
                  {current?.date && <>, {fmtDate(current.date)}</>}
                </p>
                <p>
                  {earlier.length > 0 && (
                    <>
                      Earlier:{" "}
                      {earlier.map((r, i) => (
                        <span key={r.version}>
                          {i > 0 && ", "}
                          <Link className="underline underline-offset-2 hover:text-orange" href={`/versions/#v${r.version}`}>
                            {r.version}
                          </Link>
                        </span>
                      ))}
                      .{" "}
                    </>
                  )}
                  <Link className="underline underline-offset-2 hover:text-orange" href="/versions/">
                    All versions
                  </Link>
                </p>
              </div>
            </div>
            <nav aria-label="Footer">
              <p className="font-semibold">Pages</p>
              <ul className="mt-1 space-y-0.5">
                {NAV.map((n) => (
                  <li key={n.href}>
                    <Link className="underline-offset-2 hover:text-orange hover:underline" href={n.href}>
                      {n.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link className="underline-offset-2 hover:text-orange hover:underline" href="/ai/">
                    Use it from your AI app
                  </Link>
                </li>
                <li>
                  <Link className="underline-offset-2 hover:text-orange hover:underline" href="/privacy/">
                    Privacy
                  </Link>
                </li>
              </ul>
            </nav>
            <div className="sm:col-span-2 lg:col-span-1">
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
