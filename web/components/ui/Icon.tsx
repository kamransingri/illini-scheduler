// One icon style for the whole site: 16px line icons, 1.75 stroke, round caps, drawn in currentColor.
// Decorative by default (aria-hidden); give the button or link around it an accessible name.

const PATHS = {
  chevronDown: "M4 6l4 4 4-4",
  chevronRight: "M6 4l4 4-4 4",
  chevronUp: "M4 10l4-4 4 4",
  info: "M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM8 7.25v4M8 4.75v.01",
  external: "M9.5 2.5h4v4M13.5 2.5L7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3",
  copy: "M5.5 5.5V3a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-2.5M3 5.5h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z",
  check: "M3 8.5l3.25 3.25L13 5",
  plus: "M8 3v10M3 8h10",
  minus: "M3 8h10",
  x: "M4 4l8 8M12 4l-8 8",
  rss: "M3 3a10 10 0 0 1 10 10M3 7a6 6 0 0 1 6 6M3.75 12.25v.01",
  award: "M8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5.75 9.25L5 14.5l3-1.75 3 1.75-.75-5.25",
  sort: "M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5",
  table: "M2 3.5h12v9H2zM2 7h12M6.5 7v5.5",
  rows: "M2.5 4h11M2.5 8h11M2.5 12h11",
  calendar: "M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3",
  alert: "M8 2l6.5 11.5h-13zM8 6.5v3.25M8 11.75v.01",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "", label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
