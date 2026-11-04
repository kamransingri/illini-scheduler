// A number with its source + date range shown on hover/focus (and to screen readers).
export default function Metric({ children, source, className = "" }: { children: React.ReactNode; source: string; className?: string }) {
  return (
    <span className={`metric ${className}`} tabIndex={0} title={source} aria-label={undefined}>
      {children}
      <span className="tip" role="tooltip">
        {source}
      </span>
    </span>
  );
}
