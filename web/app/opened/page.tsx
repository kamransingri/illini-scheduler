import type { Metadata } from "next";
import JustOpened from "@/components/JustOpened";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = { title: "Just opened" };

export default function OpenedPage() {
  const meta = getMeta();
  if (!meta) return <p>No data has been built yet.</p>;
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-heading">Just opened</h1>
      <p className="mt-2 mb-4 max-w-prose">Sections that just went from closed to open, newest first. The list updates itself while this page is open.</p>
      <JustOpened nextTerm={meta.next_term} currentTerm={meta.current_term} liveUrl={meta.live_url} dailyAt={meta.terms[meta.next_term]?.checked_at} />
    </div>
  );
}
