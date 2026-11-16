import Icon, { type IconName } from "./Icon";

/**
 * Neutral label chip (gen-ed codes, "Limited data", "Special section", part of term...). Badges never carry
 * colour meaning: seat status has its own component and above/below-average uses <Delta>.
 */
export function Badge({ children, icon, title, className = "" }: { children: React.ReactNode; icon?: IconName; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-start gap-1 rounded border border-line bg-white px-1.5 text-sm leading-6 text-ink ${className}`}
    >
      {icon && <Icon name={icon} className="mt-1 text-muted" />}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

export type SeatKind = "open" | "restricted" | "closed" | "unknown";

export function seatKind(status: string): SeatKind {
  const s = status.toLowerCase();
  if (!s || s.includes("pending")) return "unknown";
  if (s.includes("closed")) return "closed";
  if (s.includes("restricted")) return "restricted";
  if (s.includes("open")) return "open";
  return "unknown";
}

const SEAT_CLS: Record<SeatKind, string> = {
  open: "bg-open-bg text-open",
  restricted: "bg-restricted-bg text-restricted",
  closed: "bg-closed-bg text-closed",
  unknown: "bg-white text-muted border border-line",
};

/** Seat status: its own three colours, always with the word, so it never depends on colour alone. */
export function SeatStatus({ status, known = true, title }: { status: string; known?: boolean; title?: string }) {
  const kind = seatKind(status);
  const text =
    kind === "open" ? "Open" : kind === "restricted" ? "Restricted" : kind === "closed" ? "Closed" : status.toLowerCase().includes("pending") ? "Pending" : status || (known ? "Unknown" : "Not published");
  return (
    <span title={title ?? (kind === "restricted" ? status : undefined)} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 text-sm font-semibold leading-6 ${SEAT_CLS[kind]}`}>
      <span aria-hidden className={`size-2 rounded-full ${kind === "unknown" ? "border border-current" : "bg-current"}`} />
      {text}
    </span>
  );
}

/** Difference from the course average. Green = higher, red = lower: the only place those colours are used. */
export function Delta({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className={`text-muted ${className}`}>–</span>;
  const r = Math.round(value * 100) / 100;
  if (r === 0) return <span className={`tnum text-muted ${className}`}>±0.00</span>;
  return (
    <span className={`tnum font-semibold ${r > 0 ? "text-up" : "text-down"} ${className}`}>
      {r > 0 ? "+" : "−"}
      {Math.abs(r).toFixed(2)}
      <span className="sr-only"> {r > 0 ? "above" : "below"} the course average</span>
    </span>
  );
}
