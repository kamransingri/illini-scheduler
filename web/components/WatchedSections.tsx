"use client";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { basePath, courseHref, dataUrl, termLabel } from "@/lib/format";
import { currentStatus, fmtSince, type LiveFile } from "@/lib/live";
import type { Course, SeatEvent } from "@/lib/types";
import { encodeWatch, latestStatus, watchKey, type Watched } from "@/lib/watch";
import CopyButton from "./CopyButton";
import { AlertButton, AlertsBar, useSeatAlerts } from "./SeatAlerts";
import { SeatStatus } from "./ui/Badge";
import Info from "./ui/Info";
import WatchButton from "./WatchButton";

const courses = new Map<string, Promise<Course | null>>();
function loadCourse(s: string, n: string): Promise<Course | null> {
  const k = `${s} ${n}`;
  if (!courses.has(k))
    courses.set(
      k,
      fetch(dataUrl(`course/${s}/${n}.json`))
        .then((r) => (r.ok ? (r.json() as Promise<Course>) : null))
        .catch(() => null),
    );
  return courses.get(k)!;
}

/** The share link for a watch list: Just opened with ?w=. */
export function watchLink(items: Watched[]): string {
  return `${window.location.origin}${basePath()}/opened/?${new URLSearchParams({ w: encodeWatch(items) })}`;
}

/** Just opened's list of watched sections (#15): latest status, when it was checked, and a link to share the list. */
export default function WatchedSections({ items, events, live, now, nextTerm }: { items: Watched[]; events: SeatEvent[] | null; live: LiveFile | null; now: number; nextTerm: string }) {
  const id = useId();
  const alerts = useSeatAlerts();
  const [data, setData] = useState<Map<string, Course | null>>(new Map());
  const wanted = useMemo(() => [...new Set(items.map((i) => `${i.s} ${i.n}`))], [items]);
  useEffect(() => {
    let alive = true;
    Promise.all(wanted.map((k) => loadCourse(...(k.split(" ") as [string, string])).then((c) => [k, c] as const))).then((pairs) => alive && setData(new Map(pairs)));
    return () => {
      alive = false;
    };
  }, [wanted]);
  const feed = useMemo(() => currentStatus(events ?? [], live), [events, live]);
  const [href, setHref] = useState("");
  useEffect(() => setHref(watchLink(items)), [items]);

  return (
    <section aria-labelledby={id} className="mb-4 rounded border border-line p-3" data-testid="watched">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={id} className="font-semibold text-heading">
          Sections you watch ({items.length})
        </h2>
        <Info label="How watched sections are checked">
          Every course is read once a day; the busiest are re-read about every 10 to 20 minutes, and so are the few courses on the site&apos;s watch list.
          Watching a section here doesn&apos;t change which courses are re-read: it keeps the section in this list with its latest status, and with
          &ldquo;Only sections I watch&rdquo; and &ldquo;Notify me&rdquo; you hear only about these. Your list stays in this browser.
        </Info>
        <span className="sm:ml-auto">{href && <CopyButton text={href} label="Copy link to this list" />}</span>
      </div>
      <AlertsBar alerts={alerts} />
      <ul className="mt-2 border-t border-line">
        {items.map((i) => {
          const course = data.get(`${i.s} ${i.n}`);
          const block = course?.terms[i.t];
          const sec = block?.sections.find((x) => x.crn === i.crn);
          const daily: [string, string] | null = sec && block?.status_known ? [sec.status, sec.status_at ?? block.checked_at] : null;
          const cur = latestStatus(daily, feed.get(watchKey(i.t, i.crn)), live?.read?.[i.t]?.[`${i.s} ${i.n}`]);
          return (
            <li key={watchKey(i.t, i.crn)} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2" data-testid="watched-row">
              <span className="min-w-0 grow basis-60">
                <Link href={`${courseHref(i.s, i.n)}#crn-${i.crn}`} className="font-semibold text-action hover:underline">
                  {i.s} {i.n} {i.code}
                </Link>{" "}
                <span className="text-muted">
                  {course?.title}
                  {i.t !== nextTerm && ` · ${termLabel(i.t)}`}
                </span>
              </span>
              <span className="inline-flex items-center gap-2 text-sm tnum">
                {cur ? (
                  <>
                    <SeatStatus status={cur[0]} />
                    checked {fmtSince(cur[1], now)}
                  </>
                ) : course === undefined ? (
                  <span className="text-muted">Loading…</span>
                ) : (
                  <span className="text-muted">{sec ? "Seat status not published yet" : "No longer listed for this term"}</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <CopyButton text={i.crn} />
                <AlertButton item={i} alerts={alerts} />
                <WatchButton item={i} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
