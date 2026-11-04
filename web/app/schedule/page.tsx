import type { Metadata } from "next";
import ScheduleBuilder from "@/components/ScheduleBuilder";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = { title: "Schedule builder" };

export default function SchedulePage() {
  const meta = getMeta();
  if (!meta) return <p className="text-bad">No data has been built yet.</p>;
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Schedule builder</h1>
      <p className="text-sm text-muted">
        Every conflict-free combination of your courses (lecture + its linked discussion/lab), ranked by what matters to you. Online and
        arranged sections never conflict.
      </p>
      <ScheduleBuilder meta={{ next_term: meta.next_term, current_term: meta.current_term }} />
    </div>
  );
}
