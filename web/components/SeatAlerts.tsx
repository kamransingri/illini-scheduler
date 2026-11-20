"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { alertKey, loadPushConfig, onAlertsChange, PushError, pushSupport, readAlerts, setAlerts, writeAlerts, type PushConfig, type PushSupport } from "@/lib/push";
import { readWatch, type Watched } from "@/lib/watch";
import Icon from "./ui/Icon";
import Info from "./ui/Info";

export type SeatAlerts = {
  support: PushSupport;
  alerts: string[];
  busy: boolean;
  error: string | null;
  toggle: (item: Watched) => void;
  stopAll: () => void;
};

/** Push alerts for watched sections (#90): what this browser can do, which sections have alerts, and changing them. */
export function useSeatAlerts(): SeatAlerts {
  const [cfg, setCfg] = useState<PushConfig | null>(null);
  const [support, setSupport] = useState<PushSupport>("off");
  const [alerts, setList] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false);

  const apply = useCallback(
    async (next: string[]) => {
      if (!cfg || working.current) return;
      working.current = true;
      setBusy(true);
      setError(null);
      try {
        await setAlerts(cfg, next);
        writeAlerts(next);
      } catch (e) {
        const err = e instanceof PushError ? e : new PushError("failed", "Something went wrong with alerts. Try again.");
        setError(err.message);
        if (err.reason === "denied") setSupport("denied");
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [cfg],
  );

  useEffect(() => {
    let alive = true;
    loadPushConfig().then((c) => {
      if (!alive) return;
      setCfg(c);
      setSupport(pushSupport(c));
    });
    const sync = () => setList(readAlerts());
    sync();
    const off = onAlertsChange(sync);
    return () => {
      alive = false;
      off();
    };
  }, []);

  // Alerts for sections no longer watched (on another device's tab, or before this existed) go when the list loads.
  // WatchButton drops a section's alert as you stop watching it (lib/push.ts pruneAlerts).
  useEffect(() => {
    if (!cfg) return;
    const watched = new Set(readWatch().map((w) => alertKey(w.t, w.crn)));
    const now = readAlerts();
    const kept = now.filter((k) => watched.has(k));
    if (kept.length !== now.length) void apply(kept);
  }, [cfg, apply]);

  const toggle = (item: Watched) => {
    const k = alertKey(item.t, item.crn);
    void apply(alerts.includes(k) ? alerts.filter((a) => a !== k) : [...alerts, k]);
  };
  return { support, alerts, busy, error, toggle, stopAll: () => void apply([]) };
}

/** "Alert me" on one watched section. */
export function AlertButton({ item, alerts }: { item: Watched; alerts: SeatAlerts }) {
  if (alerts.support !== "ready") return null;
  const on = alerts.alerts.includes(alertKey(item.t, item.crn));
  const name = `${item.s} ${item.n} ${item.code}, CRN ${item.crn}`;
  return (
    <button
      type="button"
      onClick={() => alerts.toggle(item)}
      disabled={alerts.busy}
      aria-pressed={on}
      aria-label={on ? `Stop alerts for ${name}` : `Alert me when ${name} opens`}
      title={on ? "Alerts are on for this section. Press to stop them." : "Get a notification when this section opens, even with the site closed."}
      className={`inline-flex items-center gap-1 rounded border px-2 text-sm leading-7 font-semibold whitespace-nowrap disabled:opacity-60 ${
        on ? "border-action bg-action-tint text-heading" : "border-action bg-white text-action hover:bg-action-tint"
      }`}
    >
      <Icon name={on ? "check" : "bell"} />
      {on ? "Alert on" : "Alert me"}
    </button>
  );
}

const PRIVACY =
  "Alerts send the alert server two things: this browser's push address (a link from your browser's push service, " +
  "such as Google's, Mozilla's or Apple's, with the keys that encrypt messages to it) and the term and CRN of each " +
  "section you turn alerts on for. Nothing else: no name, email, account or other courses. Turning off a section's " +
  "alert, stopping all alerts or no longer watching a section removes it from the server.";

/** The line under "Sections you watch": what alerts do here, or why this browser can't get them. */
export function AlertsBar({ alerts }: { alerts: SeatAlerts }) {
  const { support, error } = alerts;
  if (support === "off") return null;
  const count = alerts.alerts.length;
  const fallback = " Until then, Notify me below works while this tab is open.";
  return (
    <div className="mt-2 text-sm" data-testid="alerts-bar">
      {support === "ready" && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {count
            ? `Alerts are on for ${count === 1 ? "1 section" : `${count} sections`}: you'll get a notification when ${count === 1 ? "it opens" : "one opens"}, even with the site closed.`
            : "Alert me sends a notification when that section opens, even with the site closed."}
          <Info label="What alerts send">{PRIVACY}</Info>
          {count > 0 && (
            <button type="button" onClick={alerts.stopAll} disabled={alerts.busy} className="font-semibold text-action underline hover:text-action-dark disabled:opacity-60">
              Stop all alerts
            </button>
          )}
        </p>
      )}
      {support === "ios-install" && (
        <p>
          On iPhone and iPad, alerts with the site closed need it on your Home Screen (iOS 16.4 or later): tap Share, then Add to Home Screen, and open
          Illini Scheduler from there.{fallback}
        </p>
      )}
      {support === "unsupported" && <p>This browser can&apos;t get alerts with the site closed. Notify me below works while this tab is open.</p>}
      {support === "denied" && !error && <p>Notifications are blocked for this site in your browser settings: allow them there to get alerts.</p>}
      {error && (
        <p className="mt-1 flex items-start gap-2" role="alert">
          <Icon name="alert" className="mt-0.5" />
          {error}
        </p>
      )}
    </div>
  );
}
