"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { courseHref, dataUrl, fmtAgo, seatVerb, termLabel } from "@/lib/format";
import type { SeatEvent } from "@/lib/types";
import AddToCart from "./AddToCart";
import { SeatStatus } from "./ui/Badge";
import Icon from "./ui/Icon";

export default function JustOpened({ nextTerm, currentTerm }: { nextTerm: string; currentTerm: string }) {
  const [events, setEvents] = useState<SeatEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState(nextTerm);
  const [all, setAll] = useState(false);

  useEffect(() => {
    fetch(dataUrl("seat-events.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SeatEvent[]>;
      })
      .then(setEvents)
      .catch((e: Error) => setError(e.message));
  }, []);

  const rows = useMemo(() => {
    const subj = subject.trim().toUpperCase();
    return (events ?? []).filter((e) => e.term === term && (all || seatVerb(e.old, e.new) === "opened") && (!subj || e.s.startsWith(subj)));
  }, [events, subject, term, all]);

  if (error)
    return (
      <p className="flex items-start gap-2 rounded border border-line p-3" role="alert">
        <Icon name="alert" className="mt-1 text-down" />
        Couldn&apos;t load recent seat changes ({error}). Reload to try again.
      </p>
    );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line pb-4">
        <select className="rounded border border-line bg-white px-2 py-1.5" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term">
          {[nextTerm, currentTerm].map((t) => (
            <option key={t} value={t}>
              {termLabel(t)}
            </option>
          ))}
        </select>
        <input
          className="w-40 rounded border border-line bg-white px-2 py-1.5 placeholder:text-muted"
          placeholder="Subject, e.g. CS"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Filter by subject"
        />
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-action" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Show closings and other changes too
        </label>
        <span className="font-semibold text-heading tnum sm:ml-auto" aria-live="polite">
          {events ? `${rows.length} change${rows.length === 1 ? "" : "s"}` : "Loading…"}
        </span>
      </div>
      {events && !rows.length && (
        <p className="mt-4 text-muted">
          Nothing {all ? "changed" : "opened"} in the last week{subject ? ` in ${subject.toUpperCase()}` : ""}.
        </p>
      )}
      <ul data-testid="opened-list">
        {rows.slice(0, 300).map((e) => {
          const verb = seatVerb(e.old, e.new);
          return (
            <li key={e.term + e.crn + e.at} className="grid gap-x-4 gap-y-1.5 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_19rem_8rem_auto] lg:items-center">
              <Link href={courseHref(e.s, e.n)} className="group min-w-0">
                <span className="font-semibold text-action group-hover:underline">
                  {e.s} {e.n}
                </span>{" "}
                <span className="group-hover:underline">{e.t}</span>
              </Link>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">
                  {e.code} {verb}
                </span>
                <SeatStatus status={e.old} />
                <Icon name="chevronRight" className="text-muted" />
                <SeatStatus status={e.new} />
              </span>
              <span className="text-sm text-muted tnum">
                CRN {e.crn}, {fmtAgo(e.at)}
              </span>
              <span>{term === nextTerm && <AddToCart subject={e.s} number={e.n} small />}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
