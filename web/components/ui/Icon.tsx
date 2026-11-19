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
  search: "M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM14.5 14.5l-3.6-3.6",
  clock: "M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13zM8 4.5V8l2.5 1.5",
  cap: "M1.5 6L8 3l6.5 3L8 9zM4.5 7.5v3.25c1 1 2.25 1.75 3.5 1.75s2.5-.75 3.5-1.75V7.5M14.5 6v4",
  layers: "M8 1.75L14.5 5 8 8.25 1.5 5zM1.5 8L8 11.25 14.5 8M1.5 11L8 14.25 14.5 11",
  bolt: "M9 1.5L3 9h4.5L7 14.5 13 7H8.5z",
  sliders: "M2.5 4.5h11M2.5 11.5h11M5.5 3v3M10.5 10v3",
  refresh: "M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3.25h-3.25",
  bell: "M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11zM6.75 14.25h2.5",
  lock: "M4.75 7.25V5a3.25 3.25 0 0 1 6.5 0v2.25M3.25 7.25h9.5v7h-9.5zM8 10v1.75",
  unlock: "M4.75 7.25V5a3.25 3.25 0 0 1 6.35-1M3.25 7.25h9.5v7h-9.5zM8 10v1.75",
  sun: "M8 10.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5zM8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9",
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
