"use client";
import { useEffect, useState } from "react";
import { pruneAlerts } from "@/lib/push";
import { isWatched, MAX_WATCH, onWatchChange, readWatch, toggleWatch, type Watched } from "@/lib/watch";
import Icon from "./ui/Icon";

/** Watch a section (#15): Just opened then lists it first, can show only watched sections and notifies on them. */
export default function WatchButton({ item }: { item: Watched }) {
  const [on, setOn] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => {
      const items = readWatch();
      setOn(isWatched(items, item.t, item.crn));
      setFull(items.length >= MAX_WATCH);
    };
    sync();
    return onWatchChange(sync);
  }, [item.t, item.crn]);
  const name = `${item.s} ${item.n} ${item.code}, CRN ${item.crn}`;
  const blocked = full && !on;
  return (
    <button
      type="button"
      onClick={() => {
        // no longer watched: its push alert stops too (#90); a failure here leaves it for Just opened to retry
        if (!toggleWatch(item)) pruneAlerts().catch(() => {});
      }}
      disabled={blocked}
      aria-pressed={on}
      aria-label={blocked ? `Watch list full (${MAX_WATCH} sections): ${name}` : `${on ? "Watching" : "Watch"} ${name}`}
      title={blocked ? `You're watching ${MAX_WATCH} sections, the most a list holds. Stop watching one on Just opened first.` : undefined}
      className={`inline-flex items-center gap-1 rounded border px-2 text-sm leading-7 font-semibold whitespace-nowrap ${
        on ? "border-action bg-action-tint text-heading" : blocked ? "border-line bg-white text-muted" : "border-action bg-white text-action hover:bg-action-tint"
      }`}
    >
      <Icon name={on ? "check" : "bell"} />
      {on ? "Watching" : "Watch"}
    </button>
  );
}
