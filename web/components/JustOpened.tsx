"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { onCartChange, readCart } from "@/lib/cart";
import { courseHref, fmtDate, SELF_SERVICE_URL, seatVerb, termLabel } from "@/lib/format";
import { currentStatus, fmtSince, POLL_MS, useNow, useSeatFeed } from "@/lib/live";
import type { SeatEvent } from "@/lib/types";
import { decodeWatch, isWatched, MAX_WATCH, mergeWatch, onWatchChange, readWatch, watchKey, writeWatch, type Watched } from "@/lib/watch";
import AddToCart from "./AddToCart";
import CopyButton from "./CopyButton";
import { Badge, SeatStatus, seatKind } from "./ui/Badge";
import Icon from "./ui/Icon";
import Info from "./ui/Info";
import WatchedSections from "./WatchedSections";

const evKey = (e: SeatEvent) => e.term + e.crn + e.at;

/** Live / daily status line: how fresh the list is, in words. */
export function Freshness({ isLive, updated, checked, polledAt, now, dailyAt }: { isLive: boolean; updated?: string; checked?: number; polledAt: Date | null; now: number; dailyAt?: string }) {
  if (isLive && updated)
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2" data-testid="freshness">
        <span className="inline-flex items-center gap-1.5 rounded bg-open-bg px-1.5 text-sm font-semibold leading-6 text-open">
          <span aria-hidden className="size-2 rounded-full bg-current motion-safe:animate-pulse" />
          Live
        </span>
        <span>
          Busy courses re-checked every ~10 minutes. Last update {fmtSince(updated, now)}
          {checked ? `, ${checked.toLocaleString()} courses re-checked in the last two days` : ""}.
        </span>
        {polledAt && <span className="text-sm text-muted">This page refreshes itself every {POLL_MS / 60000} minutes.</span>}
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2" data-testid="freshness">
      <span className="inline-flex items-center gap-1.5 rounded bg-closed-bg px-1.5 text-sm font-semibold leading-6 text-closed">
        <span aria-hidden className="size-2 rounded-full border border-current" />
        Daily
      </span>
      <span>Live updates aren&apos;t available right now; showing the daily check{dailyAt ? ` from ${fmtDate(dailyAt)}` : ""}.</span>
    </span>
  );
}

export default function JustOpened({ nextTerm, currentTerm, liveUrl, dailyAt }: { nextTerm: string; currentTerm: string; liveUrl?: string; dailyAt?: string }) {
  const feed = useSeatFeed(liveUrl);
  const now = useNow();
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState(nextTerm);
  const [all, setAll] = useState(false);
  const [mine, setMine] = useState(false);
  const [cart, setCart] = useState<string[]>([]);
  const [onlyWatched, setOnlyWatched] = useState(false);
  const [watched, setWatched] = useState<Watched[]>([]);
  const [shared, setShared] = useState<Watched[]>([]);
  const [notify, setNotify] = useState(false);
  const [notifyErr, setNotifyErr] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    // ?mine=1 (the schedule builder's "Sections to watch") starts with only the schedule's courses; ?watch=1 with only
    // the watched sections; ?w= is someone's shared watch list
    const params = new URLSearchParams(window.location.search);
    if (params.get("mine") === "1") setMine(true);
    if (params.get("watch") === "1") setOnlyWatched(true);
    setShared(decodeWatch(params.get("w")));
    const sync = () => setCart(readCart().map((c) => `${c.s} ${c.n}`));
    const syncWatch = () => setWatched(readWatch());
    sync();
    syncWatch();
    const offCart = onCartChange(sync);
    const offWatch = onWatchChange(syncWatch);
    return () => {
      offCart();
      offWatch();
    };
  }, []);
  const watchSet = useMemo(() => new Set(watched.map((w) => watchKey(w.t, w.crn))), [watched]);
  const newShared = shared.filter((w) => !isWatched(watched, w.t, w.crn));

  const rows = useMemo(() => {
    const subj = subject.trim().toUpperCase().replace(/\s+/g, " ");
    return (feed.events ?? []).filter(
      (e) =>
        e.term === term &&
        (all || seatVerb(e.old, e.new) === "opened") &&
        (!subj || `${e.s} ${e.n}`.startsWith(subj) || e.s.startsWith(subj)) &&
        (!mine || cart.includes(`${e.s} ${e.n}`)) &&
        (!onlyWatched || watchSet.has(watchKey(e.term, e.crn))),
    );
  }, [feed.events, subject, term, all, mine, cart, onlyWatched, watchSet]);
  const status = useMemo(() => currentStatus(feed.events ?? [], feed.live), [feed.events, feed.live]);

  // Openings that arrive while the page is open: mark them "New", count them in the tab title, and notify if asked.
  const settled = !!feed.events && (!liveUrl || feed.polledAt !== null); // first live read done: don't call those "new"
  useEffect(() => {
    if (!settled || !feed.events) return;
    const ids = new Set(feed.events.map(evKey));
    if (known.current === null) {
      known.current = ids;
      return;
    }
    const arrived = rows.filter((e) => !known.current!.has(evKey(e)) && seatVerb(e.old, e.new) === "opened");
    known.current = ids;
    if (!arrived.length) return;
    setFresh((f) => new Set([...f, ...arrived.map(evKey)]));
    if (notify && typeof Notification !== "undefined" && Notification.permission === "granted") {
      const first = arrived[0];
      new Notification(arrived.length > 1 ? `${arrived.length} sections just opened` : `${first.s} ${first.n} ${first.code} just opened`, {
        body: arrived.length > 1 ? arrived.slice(0, 4).map((e) => `${e.s} ${e.n} ${e.code}`).join(", ") : `CRN ${first.crn}${first.t ? `: ${first.t}` : ""}`,
        tag: "illini-just-opened",
      });
    }
  }, [settled, feed.events, rows, notify]);
  useEffect(() => {
    const base = "Just opened | Illini Scheduler";
    document.title = fresh.size ? `(${fresh.size}) ${base}` : base;
  }, [fresh]);

  const askNotify = async () => {
    setNotifyErr(null);
    if (notify) return setNotify(false);
    if (typeof Notification === "undefined") return setNotifyErr("This browser can't show notifications.");
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (p === "granted") setNotify(true);
    else setNotifyErr("Notifications are blocked for this site in your browser settings.");
  };

  if (feed.error)
    return (
      <p className="flex items-start gap-2 rounded border border-line p-3" role="alert">
        <Icon name="alert" className="mt-1 text-down" />
        Couldn&apos;t load recent seat changes ({feed.error}). Reload to try again.
      </p>
    );
  return (
    <div>
      <div className="mb-4 rounded bg-panel p-3">
        <Freshness isLive={feed.isLive} updated={feed.live?.updated} checked={feed.live?.checked[term]} polledAt={feed.polledAt} now={now} dailyAt={dailyAt} />
      </div>
      {newShared.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-action bg-action-tint p-3" role="status" data-testid="shared-watch">
          <span>
            This link shares {newShared.length === 1 ? "a watched section" : `${newShared.length} watched sections`}:{" "}
            {newShared
              .slice(0, 6)
              .map((w) => `${w.s} ${w.n} ${w.code}`)
              .join(", ")}
            {newShared.length > 6 && ` and ${newShared.length - 6} more`}.
          </span>
          {watched.length < MAX_WATCH ? (
            <button
              type="button"
              className="rounded border border-action bg-action px-3 font-semibold leading-9 text-white hover:bg-action-dark"
              onClick={() => writeWatch(mergeWatch(watched, shared))}
            >
              Watch {newShared.length === 1 ? "it" : "them"} too
            </button>
          ) : (
            <span className="text-muted">Your list is full ({MAX_WATCH} sections).</span>
          )}
        </div>
      )}
      {watched.length > 0 && <WatchedSections items={watched} events={feed.events} live={feed.live} now={now} nextTerm={nextTerm} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line pb-4">
        <select className="rounded border border-line bg-white px-2 py-1.5" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term">
          {[nextTerm, currentTerm]
            .filter((t, i, a) => a.indexOf(t) === i)
            .map((t) => (
              <option key={t} value={t}>
                {termLabel(t)}
              </option>
            ))}
        </select>
        <input
          className="w-56 rounded border border-line bg-white px-2 py-1.5 placeholder:text-muted"
          placeholder="Subject or course, e.g. CS"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Filter by subject or course"
        />
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-action" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Only my schedule&apos;s courses{cart.length ? ` (${cart.length})` : ""}
        </label>
        {(watched.length > 0 || onlyWatched) && (
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-action" checked={onlyWatched} onChange={(e) => setOnlyWatched(e.target.checked)} />
            Only sections I watch ({watched.length})
          </label>
        )}
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-action" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Show closings too
        </label>
        <button
          type="button"
          onClick={askNotify}
          aria-pressed={notify}
          className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-semibold ${notify ? "border-action bg-action-tint text-heading" : "border-action bg-white text-action hover:bg-action-tint"}`}
        >
          <Icon name="bell" />
          {notify ? "Notifying you" : "Notify me"}
        </button>
        <span className="font-semibold text-heading tnum sm:ml-auto" aria-live="polite">
          {feed.events ? `${rows.length} change${rows.length === 1 ? "" : "s"}` : "Loading…"}
        </span>
      </div>
      {notifyErr && (
        <p className="mt-2 flex items-start gap-2" role="alert">
          <Icon name="alert" className="mt-1" />
          {notifyErr}
        </p>
      )}
      {notify && <p className="mt-2 text-sm text-muted">Keep this tab open: you&apos;ll get a notification when a section matching these filters opens.</p>}
      {feed.events && !rows.length && (
        <p className="mt-4 text-muted">
          Nothing {all ? "changed" : "opened"} recently{subject ? ` in ${subject.toUpperCase()}` : ""}
          {mine ? " in your schedule's courses" : ""}
          {onlyWatched ? " in the sections you watch" : ""}.
          {onlyWatched && !watched.length && " You aren't watching any sections yet: press Watch next to a section on its course page, or under Sections to watch in the schedule builder."}
        </p>
      )}
      <ul data-testid="opened-list">
        {rows.slice(0, 300).map((e) => {
          const verb = seatVerb(e.old, e.new);
          const cur = status.get(`${e.term}|${e.crn}`);
          const stillSame = cur && cur[0] === e.new;
          const isNew = fresh.has(evKey(e));
          return (
            <li
              key={evKey(e)}
              className={`grid gap-x-4 gap-y-1.5 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_17rem_12rem_auto] lg:items-center ${isNew ? "bg-action-tint/60" : ""}`}
            >
              <div className="min-w-0">
                <Link href={`${courseHref(e.s, e.n)}#crn-${e.crn}`} className="group">
                  <span className="font-semibold text-action group-hover:underline">
                    {e.s} {e.n}
                  </span>{" "}
                  <span className="group-hover:underline">{e.t}</span>
                </Link>
                {isNew && <span className="ml-2 rounded bg-navy px-1.5 text-sm font-semibold leading-6 text-white">New</span>}
                {watchSet.has(watchKey(e.term, e.crn)) && (
                  <Badge icon="bell" className="ml-2">
                    Watching
                  </Badge>
                )}
              </div>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">
                  {e.code} {verb}
                </span>
                <SeatStatus status={e.old} />
                <Icon name="chevronRight" className="text-muted" />
                <SeatStatus status={e.new} />
              </span>
              <span className="text-sm tnum">
                <span className="block">Found {fmtSince(e.at, now)}</span>
                {cur && (
                  <span className={`block ${stillSame ? "text-muted" : "font-semibold text-heading"}`}>
                    {stillSame ? `Still ${seatKind(cur[0]) === "unknown" ? cur[0].toLowerCase() : seatKind(cur[0])} (${fmtSince(cur[1], now)})` : `Now ${cur[0].toLowerCase()} (${fmtSince(cur[1], now)})`}
                  </span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <CopyButton text={e.crn} label={e.crn} />
                {e.term === nextTerm && <AddToCart subject={e.s} number={e.n} lock={e.crn} small short />}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 inline-flex flex-wrap items-center gap-x-2 text-sm text-muted">
        A seat can go in seconds: copy the CRN and register right away.
        <a className="inline-flex items-center gap-1 font-semibold text-action underline" href={SELF_SERVICE_URL} rel="noopener">
          Register in Self-Service
          <Icon name="external" />
        </a>
        <Info label="How seat changes are found">
          Course Explorer shows open, restricted or closed per section, not seat counts. Every course is read once a day; the busiest ones (recent changes,
          closed sections, big courses) are re-read about every 10 minutes and this page picks that up within a few minutes. Self-Service is always the final
          word.
        </Info>
      </p>
    </div>
  );
}
