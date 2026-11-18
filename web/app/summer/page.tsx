import type { Metadata } from "next";
import SummerFinder from "@/components/SummerFinder";
import Info from "@/components/ui/Info";

export const metadata: Metadata = { title: "Summer courses" };

export default function SummerPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-heading">Summer courses</h1>
      <p className="mt-2 mb-6 inline-flex max-w-3xl flex-wrap items-center">
        Classes you can take over the summer, online or on campus: catch up, get ahead, or fit in a gen-ed. Session I runs four weeks from mid-May and Session II
        eight weeks from mid-June; some classes run all summer.
        <Info label="Where the summer data comes from">
          Course Explorer&apos;s summer schedules, through Wade Fagen-Ulmschneider&apos;s course-catalog mirror (the newest summer published, and the two before it
          for &quot;Summers&quot;). Independent study, internships, research and study abroad aren&apos;t listed. GPA is the recent average from the UIUC GPA
          dataset, over every term.
        </Info>
      </p>
      <SummerFinder />
    </div>
  );
}
