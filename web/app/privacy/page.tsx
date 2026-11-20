import type { Metadata } from "next";
import ClearData from "@/components/ClearData";
import { getMeta } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { STORED } from "@/lib/privacy";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Illini Scheduler keeps in your browser, what it sends anywhere (almost nothing), and how to delete it.",
};

/** Change this date in the same pull request as any change the page describes (#141). */
const UPDATED = "2026-11-20";
const LINK = "text-action underline hover:text-action-dark";
const REPO = "https://github.com/kamransingri/illini-scheduler";

export default function PrivacyPage() {
  const repo = getMeta()?.repo_url ?? REPO;
  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-heading">Privacy</h1>
        <p className="mt-1 text-muted">Last updated {fmtDate(UPDATED)}</p>
        <p className="mt-3">
          The short version: everything you enter stays in your browser. There are no accounts, no analytics, no ads and no trackers. The only things
          that leave your browser are what you put in a link you share, and, if you turn on seat alerts, the sections you want alerts for.
        </p>
      </header>

      <section aria-labelledby="kept-h">
        <h2 id="kept-h" className="font-display text-xl font-bold text-heading">
          What&apos;s kept in your browser
        </h2>
        <p className="mt-2">
          The site saves these in your browser&apos;s storage (localStorage) so they&apos;re there when you come back. They stay on this device and in
          this browser; the site has no copy.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="stored-keys">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">What</th>
                <th className="py-2 pr-3 font-semibold">Where you set it</th>
                <th className="py-2 font-semibold">Saved as</th>
              </tr>
            </thead>
            <tbody>
              {STORED.map((s) => (
                <tr key={s.key} className="border-b border-line align-top">
                  <td className="py-2 pr-3">{s.what}</td>
                  <td className="py-2 pr-3">{s.where}</td>
                  <td className="py-2">
                    <code className="rounded bg-panel px-1 text-[0.85em] break-all sm:break-normal sm:whitespace-nowrap">{s.key}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Nothing in this list is your name, email or student ID: the site never asks for them. If your browser blocks storage (some private windows
          do), it all lasts only until you close the tab.
        </p>
      </section>

      <section aria-labelledby="leaves-h">
        <h2 id="leaves-h" className="font-display text-xl font-bold text-heading">
          What leaves your browser
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            <strong>Share links.</strong> A link you copy (a schedule, a checklist, a watch list) carries what it shows in the address itself: courses,
            CRNs, your rules, your courses and plan. Anyone you send it to sees that. The site doesn&apos;t store links anywhere.
          </li>
          <li>
            <strong>Seat alerts, when you turn them on.</strong> &ldquo;Alert me&rdquo; on a watched section sends the alert server your browser&apos;s
            push address (a link from your browser&apos;s push service, such as Google&apos;s, Mozilla&apos;s or Apple&apos;s, with the keys that
            encrypt messages to it) and the term and CRN of each section. Nothing else. Turning the alert off, stopping all alerts or no longer
            watching the section deletes it from the server. Alerts aren&apos;t switched on yet; the button appears when they are.
          </li>
          <li>
            <strong>Loading the site.</strong> GitHub hosts the site and the live seat file, so like any web host it sees your IP address and browser
            when pages load, under{" "}
            <a className={LINK} href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
              GitHub&apos;s privacy statement
            </a>
            . Fonts are served by the site itself, not by a font service.
          </li>
          <li>
            <strong>Links to other sites.</strong> Course Explorer, Self-Service, Rate My Professors, the Academic Catalog and the other sites the pages
            link to only see you if you open the link, under their own policies.
          </li>
          <li>
            <strong>Your AI app.</strong> The MCP server (Use it from your AI app) runs on your own computer and reads the same public data the site
            does. What you type into your AI app is covered by that app&apos;s policy.
          </li>
        </ul>
        <p className="mt-3">
          Accounts and course reviews are planned. Before either goes live, this page will say exactly what they store, and you&apos;ll be able to
          download or delete it.
        </p>
      </section>

      <section aria-labelledby="delete-h">
        <h2 id="delete-h" className="font-display text-xl font-bold text-heading">
          Deleting it
        </h2>
        <p className="mt-2">
          This deletes everything in the table above from this browser, turns off seat alerts and removes the site&apos;s service worker. Removing the
          individual pieces works too: the Remove buttons on each page, or your browser&apos;s settings for this site (&ldquo;Clear site data&rdquo;).
        </p>
        <div className="mt-3">
          <ClearData />
        </div>
      </section>

      <section aria-labelledby="contact-h">
        <h2 id="contact-h" className="font-display text-xl font-bold text-heading">
          Questions
        </h2>
        <p className="mt-2">
          Illini Scheduler is an unofficial student project, not run by the University of Illinois. Ask about this page, or report something it gets
          wrong, in a{" "}
          <a className={LINK} href={`${repo}/issues/new`}>
            GitHub issue
          </a>
          . Changes to what the site keeps are made in public, in the same pull request as this page, and dated above.
        </p>
      </section>
    </div>
  );
}
