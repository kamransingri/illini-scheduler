import Link from "next/link";
import { courseHref } from "@/lib/format";

/**
 * One course in any list (search results, gen-ed finder, degree checklist): code and title on the left, then the same
 * columns in the same place on every list, so a course always reads the same way. Columns a list doesn't use are left
 * out of its grid (pass the same `cols` to <CourseRowHeader> and every <CourseRow> of that list).
 */
export type CourseCols = { score?: boolean; gpa?: boolean; best?: boolean; rmp?: boolean; next?: boolean; action?: boolean };

const WIDTH: Record<keyof CourseCols, string> = { score: "4rem", gpa: "6.5rem", best: "10.5rem", rmp: "3.5rem", next: "6rem", action: "9rem" };
const ORDER: (keyof CourseCols)[] = ["score", "gpa", "best", "rmp", "next", "action"];

export function gridTemplate(cols: CourseCols): string {
  return ["minmax(0,1fr)", ...ORDER.filter((k) => cols[k]).map((k) => WIDTH[k])].join(" ");
}

export function CourseRowHeader({ cols, labels }: { cols: CourseCols; labels: Partial<Record<keyof CourseCols, React.ReactNode>> }) {
  return (
    <div className="@container" aria-hidden>
      <div className="hidden gap-x-3 border-b border-line pb-2 text-sm text-muted @3xl:grid" style={{ gridTemplateColumns: gridTemplate(cols) }}>
        <span>Course</span>
        {ORDER.filter((k) => cols[k]).map((k) => (
          <span key={k} className={k === "best" || k === "next" || k === "action" ? "" : "text-right"}>
            {labels[k] ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}

type Slot = { label: string; value: React.ReactNode; sub?: React.ReactNode };

export default function CourseRow({
  subject,
  number,
  title,
  badges,
  note,
  cols,
  slots,
  action,
  as: Tag = "li",
  linkTitle = true,
  ...rest
}: {
  subject: string;
  number: string;
  title: string;
  badges?: React.ReactNode;
  note?: React.ReactNode;
  cols: CourseCols;
  slots: Partial<Record<Exclude<keyof CourseCols, "action">, Slot>>;
  action?: React.ReactNode;
  as?: "li" | "div";
  linkTitle?: boolean;
} & Record<`data-${string}`, string | number | undefined>) {
  const code = `${subject} ${number}`;
  return (
    <Tag className="@container border-b border-line" {...rest}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 py-3 @md:grid-cols-3 @3xl:items-center @3xl:[grid-template-columns:var(--cols)]" style={{ "--cols": gridTemplate(cols) } as React.CSSProperties}>
        <div className="col-span-2 min-w-0 @md:col-span-3 @3xl:col-span-1">
          <p className="leading-snug">
            {linkTitle ? (
              <Link href={courseHref(subject, number)} className="group">
                <span className="font-semibold text-action group-hover:underline">{code}</span> <span className="text-ink group-hover:underline">{title}</span>
              </Link>
            ) : (
              <>
                <span className="font-semibold">{code}</span> <span className="text-ink">{title}</span>
              </>
            )}
          </p>
          {badges && <div className="mt-1 flex flex-wrap gap-1">{badges}</div>}
          {note && <div className="mt-1 text-sm text-muted">{note}</div>}
        </div>
        {ORDER.filter((k) => cols[k] && k !== "action").map((k) => {
          const s = slots[k as Exclude<keyof CourseCols, "action">];
          const right = k !== "best" && k !== "next";
          return (
            <div key={k} className={`min-w-0 ${right ? "@3xl:text-right" : ""}`}>
              <span className="block text-sm text-muted @3xl:sr-only">{s?.label ?? ""}</span>
              <span className="block leading-tight">{s?.value ?? <span className="text-muted">–</span>}</span>
              {s?.sub && <span className="block text-sm text-muted tnum">{s.sub}</span>}
            </div>
          );
        })}
        {cols.action && <div className="col-span-2 @md:col-span-3 @3xl:col-span-1 @3xl:justify-self-end">{action}</div>}
      </div>
    </Tag>
  );
}
