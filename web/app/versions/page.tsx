import type { Metadata } from "next";
import { Fragment } from "react";
import { parseInline, type Release } from "@/lib/changelog";
import { getMeta, getReleases } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import pkg from "../../package.json";

export const metadata: Metadata = { title: "Versions", description: "Every version of Illini Scheduler and what changed in it." };

const LINK = "text-action underline hover:text-action-dark";

/** One changelog line with its `code`, **bold**, links and #issue numbers. */
function Line({ text, repo }: { text: string; repo?: string }) {
  return (
    <>
      {parseInline(text).map((t, i) => {
        if (t.kind === "code")
          return (
            <code key={i} className="rounded bg-panel px-1 text-[0.95em]">
              {t.text}
            </code>
          );
        if (t.kind === "strong") return <strong key={i}>{t.text}</strong>;
        if (t.kind === "link")
          return (
            <a key={i} href={t.href} className={LINK}>
              {t.text}
            </a>
          );
        if (t.kind === "issue" && repo)
          return (
            <a key={i} href={`${repo}/issues/${t.text}`} className={LINK}>
              #{t.text}
            </a>
          );
        return <Fragment key={i}>{t.kind === "issue" ? `#${t.text}` : t.text}</Fragment>;
      })}
    </>
  );
}

function ReleaseSection({ r, repo }: { r: Release; repo?: string }) {
  const pending = r.version === "Unreleased";
  const id = pending ? "unreleased" : `v${r.version}`;
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-4 border-t-4 border-navy pt-3" data-testid="release">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${id}-h`} className="font-display text-xl font-bold text-heading">
          {pending ? "Not in a version yet" : `Version ${r.version}`}
        </h2>
        {r.date && <span className="text-muted">{fmtDate(r.date)}</span>}
        {r.version === pkg.version && <span className="rounded bg-action-tint px-2 text-sm font-semibold text-heading">This site</span>}
        {!pending && repo && (
          <a className={`text-sm ${LINK}`} href={`${repo}/releases/tag/v${r.version}`}>
            Release on GitHub
          </a>
        )}
      </div>
      {pending && <p className="mt-1 text-muted">Already on the site; these go into the next version.</p>}
      {r.groups.map((g) => (
        <div key={g.title} className="mt-3">
          {g.title && <h3 className="font-semibold text-heading">{g.title}</h3>}
          <ul className="mt-1 list-disc space-y-1.5 pl-5">
            {g.items.map((item, i) => (
              <li key={i}>
                <Line text={item} repo={repo} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default function VersionsPage() {
  const releases = getReleases();
  const repo = getMeta()?.repo_url;
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-heading">Versions</h1>
      <p className="mt-2 mb-6">
        This site is version {pkg.version}. Every version and what changed in it, newest first.
        {repo && (
          <>
            {" "}
            The same notes are in{" "}
            <a className={LINK} href={`${repo}/blob/main/CHANGELOG.md`}>
              CHANGELOG.md
            </a>
            .
          </>
        )}
      </p>
      {releases.length ? (
        <div className="space-y-8">
          {releases.map((r) => (
            <ReleaseSection key={r.version} r={r} repo={repo} />
          ))}
        </div>
      ) : (
        <p>The version history isn&apos;t in this build.</p>
      )}
    </div>
  );
}
