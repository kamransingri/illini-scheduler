import type { Metadata } from "next";
import JustOpened from "@/components/JustOpened";
import { getMeta } from "@/lib/data";
import { termLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Just opened" };

export default function OpenedPage() {
  const meta = getMeta();
  if (!meta) return <p className="text-bad">No data has been built yet.</p>;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold tracking-tight">Just opened</h1>
      <p className="text-sm text-muted">
        Sections whose status changed in the last week ({termLabel(meta.next_term)} and {termLabel(meta.current_term)}). Status is read from
        Course Explorer about once a day, so a seat may already be gone: confirm in Self-Service. To follow one course, use the
        &ldquo;Watch seats&rdquo; RSS link on its page.
      </p>
      <JustOpened nextTerm={meta.next_term} currentTerm={meta.current_term} />
    </div>
  );
}
