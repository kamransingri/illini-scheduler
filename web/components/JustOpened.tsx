"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { courseHref, dataUrl, fmtAgo, seatVerb, termLabel } from "@/lib/format";
import type { SeatEvent } from "@/lib/types";
import AddToCart from "./AddToCart";

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
      <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-bad" role="alert">
        Couldn&apos;t load recent seat changes ({error}).
      </p>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select className="rounded border border-line p-1" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term">
          {[nextTerm, currentTerm].map((t) => (
            <option key={t} value={t}>
              {termLabel(t)}
            </option>
          ))}
        </select>
        <input
          className="w-32 rounded border border-line p-1"
          placeholder="Subject, e.g. CS"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Filter by subject"
        />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Show closings and other changes too
        </label>
        <span className="text-muted" aria-live="polite">
          {events ? `${rows.length} change${rows.length === 1 ? "" : "s"}` : "Loading…"}
        </span>
      </div>
      {events && !rows.length && <p className="text-sm text-muted">Nothing {all ? "changed" : "opened"} in the last week{subject ? ` in ${subject.toUpperCase()}` : ""}.</p>}
      <ul className="divide-y divide-line" data-testid="opened-list">
        {rows.slice(0, 300).map((e) => {
          const verb = seatVerb(e.old, e.new);
          return (
            <li key={e.term + e.crn + e.at} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <Link href={courseHref(e.s, e.n)} className="font-semibold no-underline hover:underline">
                {e.s} {e.n}
              </Link>
              <span className="min-w-0 flex-1 truncate">{e.t}</span>
              <span className={verb === "opened" ? "text-good" : verb === "closed" ? "text-bad" : ""}>
                {e.code} {verb} ({e.old} → {e.new})
              </span>
              <span className="text-xs text-muted">CRN {e.crn} · {fmtAgo(e.at)}</span>
              {term === nextTerm && <AddToCart subject={e.s} number={e.n} small />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
