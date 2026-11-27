import type { Metadata } from "next";
import Link from "next/link";
import { getMeta } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Illini Scheduler is unofficial: check before you register, no warranty, and how to reuse its data.",
};

/** Change this date in the same pull request as any change the page describes (#141). */
const UPDATED = "2026-11-20";
const LINK = "text-action underline hover:text-action-dark";
const REPO = "https://github.com/kamransingri/illini-scheduler";
const H2 = "font-display text-xl font-bold text-heading";

export default function TermsPage() {
  const repo = getMeta()?.repo_url ?? REPO;
  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-heading">Terms of use</h1>
        <p className="mt-1 text-muted">Last updated {fmtDate(UPDATED)}</p>
        <p className="mt-3">
          The short version: Illini Scheduler is an unofficial student project. Use it to plan, then check what matters in the University&apos;s own
          systems before you register. You&apos;re welcome to reuse its data if you credit where it comes from.
        </p>
      </header>

      <section aria-labelledby="unofficial-h">
        <h2 id="unofficial-h" className={H2}>
          Unofficial, and not the University&apos;s
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            Illini Scheduler isn&apos;t affiliated with, endorsed by or run by the University of Illinois. Its data is copied from public sources and
            can be wrong or late.
          </li>
          <li>
            Before you register, confirm sections, seats and restrictions in{" "}
            <a target="_blank" rel="noopener noreferrer" className={LINK} href="https://courses.illinois.edu/">
              Course Explorer
            </a>{" "}
            and Self-Service, and degree requirements with your advisor. The site&apos;s limits are listed in{" "}
            <a target="_blank" rel="noopener noreferrer" className={LINK} href={`${repo}/blob/main/docs/LIMITATIONS.md`}>
              LIMITATIONS.md
            </a>
            .
          </li>
          <li>Nothing here registers you for anything, holds a seat or changes your records.</li>
        </ul>
      </section>

      <section aria-labelledby="warranty-h">
        <h2 id="warranty-h" className={H2}>
          No warranty
        </h2>
        <p className="mt-2">
          The site is provided as it is, with no promise that it&apos;s correct, complete or available. It can change, lose features or go down at any
          time. Nobody working on it is responsible for a class you missed, a seat you didn&apos;t get or a plan that didn&apos;t work out.
        </p>
      </section>

      <section aria-labelledby="data-h">
        <h2 id="data-h" className={H2}>
          Using the data
        </h2>
        <p className="mt-2">
          Everything the site shows is public JSON you can read from scripts, notebooks or AI tools, described in the{" "}
          <a target="_blank" rel="noopener noreferrer" className={LINK} href={`${repo}/blob/main/docs/API.md`}>
            data API docs
          </a>
          . You may reuse it if you:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            Credit the sources the API docs list: Course Explorer, Wade Fagen-Ulmschneider&apos;s datasets, the Academic Catalog, CITL and Rate My
            Professors. Rate My Professors ratings belong to Rate My Professors and its reviewers, so link to the professor&apos;s page when you
            show them.
          </li>
          <li>
            Go easy on the servers. The files change once a night (seat changes about every 10 minutes), so cache them instead of fetching them
            again and again. When a hosted API exists, its rate limits will be in the API docs.
          </li>
          <li>Follow each source&apos;s own terms. Where they&apos;re stricter than this page, theirs win.</li>
        </ul>
      </section>

      <section aria-labelledby="reviews-h">
        <h2 id="reviews-h" className={H2}>
          Course reviews
        </h2>
        <p className="mt-2">
          Reviews aren&apos;t open yet. Before they open, this page will link the rules for posting one. Reviews posted here may not be used to
          train AI models.
        </p>
      </section>

      <section aria-labelledby="more-h">
        <h2 id="more-h" className={H2}>
          More
        </h2>
        <p className="mt-2">
          What the site keeps about you is on the{" "}
          <Link className={LINK} href="/privacy/">
            privacy page
          </Link>
          , and how AI tools are used to build it and read it is in the{" "}
          <a target="_blank" rel="noopener noreferrer" className={LINK} href={`${repo}/blob/main/docs/AI-USE.md`}>
            AI use policy
          </a>
          . Ask about these terms, or report something the site gets wrong, in a{" "}
          <a target="_blank" rel="noopener noreferrer" className={LINK} href={`${repo}/issues/new`}>
            GitHub issue
          </a>
          . Changes are made in public and dated above.
        </p>
      </section>
    </div>
  );
}
