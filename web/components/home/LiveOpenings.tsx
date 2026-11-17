"use client";
import Link from "next/link";
import { useMemo } from "react";
import { courseHref, seatVerb } from "@/lib/format";
import { fmtSince, useNow, useSeatFeed } from "@/lib/live";
import type { SeatEvent } from "@/lib/types";
import CopyButton from "../CopyButton";
import Icon from "../ui/Icon";

/** The five newest openings for the next term, kept up to date while the home page is open. */
export default function LiveOpenings({ nextTerm, liveUrl }: { nextTerm: string; liveUrl?: string }) {
  const feed = useSeatFeed(liveUrl);
  const now = useNow();
  // One row per course (newest opening first), so one big course opening ten sections doesn't fill the list.
  const rows = useMemo(() => {
    const by = new Map<string, SeatEvent[]>();
    for (const e of feed.events ?? []) {
      if (e.term !== nextTerm || seatVerb(e.old, e.new) !== "opened") continue;
      const k = `${e.s} ${e.n}`;
      if (!by.has(k) && by.size >= 5) continue;
      by.set(k, [...(by.get(k) ?? []), e]);
    }
    return [...by.values()];
  }, [feed.events, nextTerm]);
  return (
    <section aria-labelledby="live-h" className="rounded bg-panel p-4" data-testid="home-live">
      <div className="flex items-center justify-between gap-2">
        <h2 id="live-h" className="flex items-center gap-2 text-lg font-semibold text-heading">
          <Icon name="bolt" className="text-action" />
          Just opened
        </h2>
        {feed.isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded bg-open-bg px-1.5 text-sm font-semibold leading-6 text-open">
            <span aria-hidden className="size-2 rounded-full bg-current motion-safe:animate-pulse" />
            Live
          </span>
        ) : (
          <span className="text-sm text-muted">Daily check</span>
        )}
      </div>
      {feed.error && <p className="mt-2 text-muted">Seat changes couldn&apos;t load.</p>}
      {!feed.events && !feed.error && <p className="mt-2 text-muted">Loading…</p>}
      {feed.events && !rows.length && <p className="mt-2 text-muted">No sections opened in the last few days.</p>}
      <ul className="mt-2">
        {rows.map(([e, ...more]) => (
          <li key={e.term + e.crn + e.at} className="flex items-center justify-between gap-3 border-t border-line py-2">
            <Link href={`${courseHref(e.s, e.n)}#crn-${e.crn}`} className="group min-w-0">
              <span className="font-semibold text-action group-hover:underline">
                {e.s} {e.n}
              </span>{" "}
              <span className="text-sm">
                {e.code}
                {more.length ? ` and ${more.length} more` : ""}
              </span>
              <span className="block text-sm text-muted">Opened, found {fmtSince(e.at, now)}</span>
            </Link>
            <CopyButton text={e.crn} label={e.crn} className="shrink-0" />
          </li>
        ))}
      </ul>
      <Link href="/opened/" className="mt-2 inline-block font-semibold text-action hover:underline">
        See every opening
      </Link>
    </section>
  );
}
