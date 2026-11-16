import Info from "./Info";

/** A label/value pair in a <dl>: label on the left (or above on phones), value on the right. */
export default function DataRow({ label, children, source }: { label: React.ReactNode; children: React.ReactNode; source?: React.ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[11rem_1fr]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">
        {children}
        {source && <Info>{source}</Info>}
      </dd>
    </div>
  );
}
