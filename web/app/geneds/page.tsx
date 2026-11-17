import type { Metadata } from "next";
import GenedFinder from "@/components/GenedFinder";
import Info from "@/components/ui/Info";
import { getMeta } from "@/lib/data";
import { fmtDate, termLabel, termRange } from "@/lib/format";

export const metadata: Metadata = { title: "Gen-ed finder" };

export default function GenedsPage() {
  const meta = getMeta();
  if (!meta) return <p>No data has been built yet.</p>;
  const next = meta.terms[meta.next_term];
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-heading">Gen-ed finder</h1>
      <p className="mt-2 mb-6 inline-flex flex-wrap items-center">
        Gen-eds for {termLabel(meta.next_term)} that count for every category you pick, ranked by the best pick score. Only courses with an open section show until you turn that off.
        <Info label="Where the gen-ed data comes from">
          Gen-ed codes from the UIUC gen-ed list (as of {fmtDate(meta.geneds_snapshot)}) and Course Explorer. GPA is the recent average over{" "}
          {termRange(meta.gpa.recent[0], meta.gpa.recent[meta.gpa.recent.length - 1])} from the UIUC GPA dataset. Sections from the{" "}
          {termLabel(meta.next_term)} schedule as of {fmtDate(next?.checked_at)}.
        </Info>
      </p>
      <GenedFinder nextTerm={meta.next_term} rmpAvailable={!meta.rmp_status.startsWith("unavailable")} priors={meta.score_priors ?? null} />
    </div>
  );
}
