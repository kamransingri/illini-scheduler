import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import Logo from "@/components/Logo";
import SiteNav from "@/components/SiteNav";
import { getReleases } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { FOOTER } from "@/lib/nav";
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
  // The footer names the live version only; every earlier one is on the Versions page (CHANGELOG.md).
  const current = getReleases().find((r) => r.version === pkg.version);
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
          <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-8 px-4 py-8 text-sm leading-relaxed lg:grid-cols-[1.3fr_2fr]">
            <div>
              <Logo />
              <p className="mt-3 max-w-sm text-white/85">
                Unofficial and not affiliated with the University of Illinois. Data can be out of date: confirm sections, seats and restrictions in
                Self-Service before registering.
              </p>
              <p className="mt-3" data-testid="site-version">
                <Link className="font-semibold underline-offset-2 hover:text-orange hover:underline" href={`/versions/#v${pkg.version}`}>
                  Version {pkg.version}
                </Link>
                {current?.date && <span className="text-white/70">, {fmtDate(current.date)}</span>}
              </p>
            </div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              {FOOTER.map((g) => (
                <div key={g.title}>
                  <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">{g.title}</p>
                  <ul className="mt-2 space-y-1">
                    {g.links.map((l) => (
                      <li key={l.href}>
                        {l.href.startsWith("https://") ? (
                          <a className="underline-offset-2 hover:text-orange hover:underline" href={l.href}>
                            {l.label}
                          </a>
                        ) : (
                          <Link className="underline-offset-2 hover:text-orange hover:underline" href={l.href}>
                            {l.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
