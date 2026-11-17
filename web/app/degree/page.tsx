import type { Metadata } from "next";
import DegreeChecklist from "@/components/DegreeChecklist";
import Info from "@/components/ui/Info";
import { getDegreeIndex, getMeta } from "@/lib/data";

export const metadata: Metadata = {
  title: "Degree checklist",
  description: "Enter the courses you've finished and see which requirements of your major, minor and gen-eds are still open, with the best courses for each.",
};

export default function DegreePage() {
  const meta = getMeta();
  const programs = getDegreeIndex();
  if (!meta) return <p>No data has been built yet.</p>;
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-heading">Degree checklist</h1>
      <p className="mt-2 mb-6 inline-flex max-w-3xl flex-wrap items-center">
        Add the courses you&apos;ve finished to see which requirements are still open and the best courses for each.
        <Info label="About this checklist">
          Requirements are copied from the Academic Catalog for one catalog year, and your list stays in this browser (and in the link, if you share
          it). This is a planning aid, not your official degree audit: confirm with your college advisor before you rely on it.
        </Info>
      </p>
      {programs.length ? (
        <DegreeChecklist programs={programs} meta={{ next_term: meta.next_term, score_priors: meta.score_priors ?? null }} />
      ) : (
        <p>No degree programs have been added yet.</p>
      )}
    </div>
  );
}
