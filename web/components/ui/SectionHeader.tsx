/** A page section heading with optional actions on the right and an optional one-line lead under it. */
export default function SectionHeader({
  id,
  title,
  actions,
  lead,
  level = 2,
}: {
  id: string;
  title: React.ReactNode;
  actions?: React.ReactNode;
  lead?: React.ReactNode;
  level?: 2 | 3;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <H id={id} className={level === 2 ? "font-display text-xl font-bold text-heading" : "text-lg font-semibold text-heading"}>
          {title}
        </H>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {lead && <p className="mt-1 max-w-prose text-muted">{lead}</p>}
    </div>
  );
}
