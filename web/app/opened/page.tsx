import type { Metadata } from "next";
import JustOpened from "@/components/JustOpened";
import Info from "@/components/ui/Info";
import { getMeta } from "@/lib/data";
import { termLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Just opened" };

export default function OpenedPage() {
  const meta = getMeta();
  if (!meta) return <p>No data has been built yet.</p>;
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-heading">Just opened</h1>
      <p className="mt-2 mb-6 inline-flex flex-wrap items-center">
        Sections whose seat status changed in the last week, newest first.
        <Info label="How seat changes are found">
          Status is read from the public Course Explorer pages about once a day ({termLabel(meta.next_term)} and {termLabel(meta.current_term)}), so a
          seat may already be gone: confirm in Self-Service. To follow one course, use the &ldquo;Watch seats&rdquo; RSS link on its page.
        </Info>
      </p>
      <JustOpened nextTerm={meta.next_term} currentTerm={meta.current_term} />
    </div>
  );
}
