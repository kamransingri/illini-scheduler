import type { Metadata } from "next";
import Link from "next/link";
import SummerRedirect from "@/components/SummerRedirect";
import { DEFAULT_SUMMER, summerHref } from "@/lib/summer";

export const metadata: Metadata = { title: "Summer courses", robots: { index: false } };

// The Summer courses page became the gen-ed finder's Summer view (#124). Old links and bookmarks land on the same
// classes: the redirect carries their filters over (lib/summer.ts summerRedirect).
export default function SummerPage() {
  return (
    <div>
      <SummerRedirect />
      <h1 className="font-display text-2xl font-bold text-heading">Summer courses have moved</h1>
      <p className="mt-2">
        Summer classes are now in the{" "}
        <Link href={summerHref({ ...DEFAULT_SUMMER, gened: "all" })} className="font-semibold text-action underline">
          gen-ed finder&apos;s Summer view
        </Link>
        , on each course page and in the search.
      </p>
    </div>
  );
}
