"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { courseHref, termLabel } from "@/lib/format";
import type { MyCourse, MyState } from "@/lib/mycourses";
import { addToTerm, gradOptions, plannedIn, planTerms, removeFromPlan, termHours, termIndex } from "@/lib/plan";
import Icon from "./ui/Icon";

type Props = {
  st: MyState;
  update: (s: MyState) => void;
  nextTerm: string;
  /** My courses with AP and IB credit: they count as already done. */
  mine: MyCourse[];
  /** A course's [min, max] credit hours, or null when this site doesn't know it. */
  lookup: (code: string) => [number, number] | null;
  /** A course's title, or "" when it isn't in the course data (still loading, or a wrong code). */
  titleOf: (code: string) => string;
  totalHours: number | null;
};

const fmtHours = (h: number, variable: boolean) => `${h}${variable ? "+" : ""} hour${h === 1 && !variable ? "" : "s"}`;

/** Four-year plan (#114): the terms ahead with their courses and hours. The checklist below says when each requirement gets finished. */
export default function FourYearPlan({ st, update, nextTerm, mine, lookup, titleOf, totalHours }: Props) {
  const plan = st.plan;
  const setPlan = (next: MyState["plan"]) => update({ ...st, plan: next });
  const terms = planTerms(plan, nextTerm);
  const own = new Map(mine.map((c) => [`${c.s} ${c.n}`, c]));
  const hoursOf = (code: string): [number, number] | null => {
    const h = own.get(code)?.hours;
    return h !== undefined ? [h, h] : lookup(code);
  };
  const done = termHours([...own.keys()], hoursOf);
  const planned = termHours(Object.values(plan.terms).flat(), hoursOf);
  const id = useId();

  return (
    <section aria-labelledby={`${id}-h`} className="rounded border border-line p-4 sm:p-5" data-testid="plan">
      <h2 id={`${id}-h`} className="font-display text-xl font-bold text-heading">
        Four-year plan
      </h2>
      <p className="mt-1 max-w-3xl">
        Put the courses you still need into the terms ahead. Each requirement below then says the term it&apos;s finished in. Courses in My courses count
        as already done.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="inline-flex items-center gap-2">
          <span className="font-semibold text-heading">Expected graduation</span>
          <select className="rounded border border-line bg-white px-2 py-1.5" value={plan.grad} onChange={(e) => setPlan({ ...plan, grad: e.target.value })}>
            <option value="">Choose a term</option>
            {gradOptions(nextTerm, plan.grad).map((t) => (
              <option key={t} value={t}>
                {termLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-action" checked={plan.summers} onChange={(e) => setPlan({ ...plan, summers: e.target.checked })} />
          Summer terms
        </label>
      </div>

      {terms.length > 0 && (
        <>
          <p className="mt-4 text-sm" data-testid="plan-summary">
            Already done: <span className="font-semibold tnum">{own.size}</span> course{own.size === 1 ? "" : "s"} in My courses ({fmtHours(done.hours, done.variable)}). Planned:{" "}
            <span className="font-semibold tnum">{fmtHours(planned.hours, planned.variable)}</span>
            {totalHours ? (
              <>
                , so {done.hours + planned.hours} of the {totalHours} hours to graduate
              </>
            ) : null}
            .{(done.unknown.length > 0 || planned.unknown.length > 0) && <> Hours unknown for {[...done.unknown, ...planned.unknown].join(", ")}.</>}
          </p>
          <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {terms.map((t) => (
              <Term key={t} term={t} st={st} setPlan={setPlan} nextTerm={nextTerm} own={own} hoursOf={hoursOf} titleOf={titleOf} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Term({
  term,
  st,
  setPlan,
  nextTerm,
  own,
  hoursOf,
  titleOf,
}: {
  term: string;
  st: MyState;
  setPlan: (p: MyState["plan"]) => void;
  nextTerm: string;
  own: Map<string, MyCourse>;
  hoursOf: (code: string) => [number, number] | null;
  titleOf: (code: string) => string;
}) {
  const plan = st.plan;
  const codes = plan.terms[term] ?? [];
  const h = termHours(codes, hoursOf);
  const name = termLabel(term);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const add = () => {
    const m = /^\s*([A-Za-z]{2,5})\s*-?\s*(\d{3})\s*$/.exec(text);
    if (!m) return setMsg("Type a course code like CS 225.");
    const code = `${m[1].toUpperCase()} ${m[2]}`;
    if (!titleOf(code)) return setMsg(`${code} isn't in the course data this site has. Check the code.`);
    if (own.has(code)) return setMsg(`${code} is already in My courses.`);
    const where = plannedIn(plan, code);
    if (where) return setMsg(`${code} is already in ${termLabel(where)}.`);
    setPlan(addToTerm(plan, term, code));
    setText("");
    setMsg(null);
  };
  const past = termIndex(term) < termIndex(nextTerm);
  const late = !!plan.grad && termIndex(term) > termIndex(plan.grad);
  return (
    <li className="rounded bg-panel p-3" data-testid="plan-term" data-term={term}>
      <h3 className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-semibold text-heading">{name}</span>
        <span className="text-sm text-muted tnum" data-testid="term-hours">
          {codes.length ? fmtHours(h.hours, h.variable) : "No courses yet"}
        </span>
      </h3>
      {(past || late) && (
        <p className="mt-1 text-sm">{past ? "This term has started or passed: add what you took to My courses and remove it here." : "After your expected graduation."}</p>
      )}
      {codes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {codes.map((c) => {
            const cr = hoursOf(c);
            return (
              <li key={c} className="flex items-center gap-2">
                <span className="min-w-0 grow">
                  <Link href={courseHref(...(c.split(" ") as [string, string]))} className="font-semibold text-action hover:underline">
                    {c}
                  </Link>{" "}
                  <span className="text-sm text-muted">{titleOf(c)}</span>
                </span>
                <span className="text-sm text-muted tnum">{cr ? (cr[0] === cr[1] ? cr[0] : `${cr[0]}-${cr[1]}`) : "?"}</span>
                <button
                  type="button"
                  className="rounded p-1 text-muted hover:bg-white hover:text-ink"
                  aria-label={`Remove ${c} from ${name}`}
                  onClick={() => setPlan(removeFromPlan(plan, c))}
                >
                  <Icon name="x" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-line bg-white px-2 py-1 placeholder:text-muted"
          placeholder="e.g. CS 225"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Add a course to ${name}`}
          autoComplete="off"
        />
        <button type="submit" className="inline-flex items-center gap-1 rounded border border-action bg-white px-2 font-semibold text-action hover:bg-action-tint">
          <Icon name="plus" />
          Add
        </button>
      </form>
      {msg && (
        <p className="mt-1 text-sm" role="alert">
          {msg}
        </p>
      )}
    </li>
  );
}
