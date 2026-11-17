"use client";
// Seat changes for "Just opened" and the home page: the nightly build's last week (data/seat-events.json) merged with
// the live feed (live.json on the live-seats branch, written every ~10 minutes by pipeline/live_seats.py and read from
// raw.githubusercontent.com, which allows cross-origin reads and caches for 5 minutes).
import { useEffect, useRef, useState } from "react";
import { dataUrl } from "./format";
import type { SeatEvent } from "./types";

export type LiveFile = {
  updated: string;
  window_hours: number;
  checked: Record<string, number>;
  events: SeatEvent[];
  seen: Record<string, Record<string, [string, string]>>;
};

export const POLL_MS = 120_000;
/** live.json older than this means the live job isn't running: say so instead of calling the page live. */
export const STALE_MS = 45 * 60_000;

/**
 * One list, newest first. The same change can be found twice (by the live job, then by the daily crawl hours later):
 * walking oldest to newest, an event that only repeats the status already known for that section is dropped, so the
 * earlier detection wins.
 */
export function mergeEvents(...lists: SeatEvent[][]): SeatEvent[] {
  const all = lists.flat().sort((a, b) => a.at.localeCompare(b.at));
  const status = new Map<string, string>();
  const out: SeatEvent[] = [];
  for (const e of all) {
    const k = `${e.term}|${e.crn}`;
    if (status.get(k) === e.new) continue;
    status.set(k, e.new);
    out.push(e);
  }
  return out.reverse();
}

/** Latest known status per section ("term|crn" -> [status, checked at]): newest of its last event and the live check. */
export function currentStatus(events: SeatEvent[], live: LiveFile | null): Map<string, [string, string]> {
  const m = new Map<string, [string, string]>();
  for (const e of [...events].reverse()) m.set(`${e.term}|${e.crn}`, [e.new, e.at]);
  for (const [term, rows] of Object.entries(live?.seen ?? {}))
    for (const [crn, v] of Object.entries(rows)) {
      const cur = m.get(`${term}|${crn}`);
      if (!cur || v[1] >= cur[1]) m.set(`${term}|${crn}`, v);
    }
  return m;
}

export type SeatFeed = {
  events: SeatEvent[] | null;
  error: string | null;
  live: LiveFile | null;
  /** live.json was read and is recent */
  isLive: boolean;
  /** when the page last asked for updates */
  polledAt: Date | null;
  refresh: () => void;
};

export function useSeatFeed(liveUrl: string | null | undefined): SeatFeed {
  const [base, setBase] = useState<SeatEvent[] | null>(null);
  const [live, setLive] = useState<LiveFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polledAt, setPolledAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    fetch(dataUrl("seat-events.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SeatEvent[]>;
      })
      .then(setBase)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!liveUrl) return;
    const poll = () => {
      if (busy.current || document.visibilityState === "hidden") return;
      busy.current = true;
      fetch(liveUrl, { cache: "no-cache" })
        .then((r) => (r.ok ? (r.json() as Promise<LiveFile>) : null))
        .then((f) => f && Array.isArray(f.events) && setLive(f))
        .catch(() => {})
        .finally(() => {
          busy.current = false;
          setPolledAt(new Date());
        });
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [liveUrl, tick]);

  const events = base === null ? null : mergeEvents(base, live?.events ?? []);
  const isLive = !!live && Date.now() - new Date(live.updated).getTime() < STALE_MS;
  return { events, error, live, isLive, polledAt, refresh: () => setTick((x) => x + 1) };
}

/** "just now", "4 min ago", "2 h ago", "3 days ago". */
export function fmtSince(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** Re-render every `ms` so "x min ago" labels stay true. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
