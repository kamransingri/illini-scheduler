import type { Metadata } from "next";
import ScheduleBuilder from "@/components/ScheduleBuilder";
import Info from "@/components/ui/Info";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = { title: "Schedule builder" };

export default function SchedulePage() {
  const meta = getMeta();
  if (!meta) return <p>No data has been built yet.</p>;
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-heading">Schedule builder</h1>
      <p className="mt-2 mb-6 inline-flex flex-wrap items-center">
        Every conflict-free combination of your courses, ranked by what matters to you.
        <Info label="How schedules are built">
          Each course is a lecture plus the discussion or lab linked to it. Online and arranged sections never conflict; first-half and second-half
          sections of the term never conflict with each other.
        </Info>
      </p>
      <ScheduleBuilder meta={{ next_term: meta.next_term, current_term: meta.current_term, rmpAvailable: !meta.rmp_status.startsWith("unavailable") }} />
    </div>
  );
}
