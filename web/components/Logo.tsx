/**
 * The mark: the "ili" of Illini drawn as three columns of a week timetable. The white strokes are days, the orange
 * squares (the dots of the i's) are classes dropped into them. Flat brand colours, no gradient, no Block I (that's the
 * University's trademark and this site is unofficial). app/icon.svg is the same mark on a navy tile.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="6 5 20 22" className={className} aria-hidden focusable="false">
      <rect x="6.5" y="13" width="5" height="13" rx="1.25" fill="#fff" />
      <rect x="6.5" y="6" width="5" height="5" rx="1.25" fill="#ff5f05" />
      <rect x="13.5" y="6" width="5" height="20" rx="1.25" fill="#fff" />
      <rect x="20.5" y="13" width="5" height="13" rx="1.25" fill="#fff" />
      <rect x="20.5" y="6" width="5" height="5" rx="1.25" fill="#ff5f05" />
    </svg>
  );
}

/** Mark + wordmark for the navy site header and footer. */
export default function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className="h-7 w-auto" />
      <span className="text-lg leading-none">
        <span className="font-bold">Illini</span> <span className="font-normal">Scheduler</span>
      </span>
    </span>
  );
}
