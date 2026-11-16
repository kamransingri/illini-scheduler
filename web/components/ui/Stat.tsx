import Info from "./Info";

/**
 * One number with its label. The value is the main thing; `sub` is secondary; `source` (where the number comes from,
 * term range, sample size) sits behind an (i) button next to the value.
 */
export default function Stat({
  label,
  value,
  sub,
  source,
  size = "lg",
  className = "",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  source?: React.ReactNode;
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5">
        <span className="inline-flex items-center gap-0.5">
          <span className={`tnum font-semibold text-heading ${size === "lg" ? "font-display text-xl" : "text-lg"}`}>{value}</span>
          {source && <Info label={`Source for ${typeof label === "string" ? label.toLowerCase() : "this number"}`}>{source}</Info>}
        </span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </dd>
    </div>
  );
}
