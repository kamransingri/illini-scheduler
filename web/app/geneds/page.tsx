import type { Metadata } from "next";
import GenedFinder from "@/components/GenedFinder";
import { getMeta } from "@/lib/data";
import { fmtDate, termLabel, termRange } from "@/lib/format";

export const metadata: Metadata = { title: "Gen-ed finder" };

export default function GenedsPage() {
  const meta = getMeta();
  if (!meta) return <p className="text-bad">No data has been built yet.</p>;
  const next = meta.terms[meta.next_term];
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Gen-ed finder · {termLabel(meta.next_term)}</h1>
        <p className="mt-1 text-sm text-muted">
          Gen-ed codes from the UIUC gen-ed list (as of {fmtDate(meta.geneds_snapshot)}). GPA = recent average over{" "}
          {termRange(meta.gpa.recent[0], meta.gpa.recent[meta.gpa.recent.length - 1])} from the GPA dataset. Sections from the{" "}
          {termLabel(meta.next_term)} schedule as of {fmtDate(next?.checked_at)}.
        </p>
      </header>
      <GenedFinder nextTerm={meta.next_term} rmpAvailable={!meta.rmp_status.startsWith("unavailable")} />
    </div>
  );
}
