"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { hourWarnings, totalHours } from "@/lib/credits";
import { courseHref, termLabel } from "@/lib/format";
import type { MyCourse, MyState } from "@/lib/mycourses";
import { COURSE_DRAG, gradOptions, moveToTerm, offeringWarning, plannedIn, planTerms, prereqWarning, removeFromPlan, termHours, termIndex } from "@/lib/plan";
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
  /** When a course usually runs (search.json `o`), for the offering warnings (#116). */
  patternOf: (code: string) => string | undefined;
  /** A course's catalog prerequisite sentence, when the program's data has it, for the prerequisite warnings (#21). */
  preOf: (code: string) => string | undefined;
  totalHours: number | null;
};

const fmtHours = (h: number, variable: boolean) => `${h}${variable ? "+" : ""} hour${h === 1 && !variable ? "" : "s"}`;

/**
 * Four-year plan: the terms ahead with their courses and hours (#114). Courses go into a term by typing a code, by
 * dragging one from the checklist's options or from another term, or with a course's "Move to" menu (#115). The
 * checklist below says when each requirement gets finished.
 */
export default function FourYearPlan({ st, update, nextTerm, mine, lookup, titleOf, patternOf, preOf, totalHours }: Props) {
  const plan = st.plan;
  const setPlan = (next: MyState["plan"]) => update({ ...st, plan: next });
  const terms = planTerms(plan, nextTerm);
  const own = new Map(mine.map((c) => [`${c.s} ${c.n}`, c]));
  const hoursOf = (code: string): [number, number] | null => {
    const h = own.get(code)?.hours;
    return h !== undefined ? [h, h] : lookup(code);
  };
  const done = termHours([...own.keys()], hoursOf);
  const prereqNote = (code: string, term: string) => prereqWarning(preOf(code), term, plan, [...own.keys()], termLabel(term));
  const planned = termHours(Object.values(plan.terms).flat(), hoursOf);
  const id = useId();
  const [said, say] = useState("");

  /**
   * A course into a term, from the add box, a drop or the menu. Returns why it can't go there, or null. Only a typed
   * code is checked against the course data (Term's add): a planned or dragged course is known to exist, and a move
   * mustn't fail while that data is still loading.
   */
  const place = (code: string, term: string): string | null => {
    if (own.has(code)) return `${code} is already in My courses.`;
    const from = plannedIn(plan, code);
    if (from === term) return null;
    setPlan(moveToTerm(plan, code, term));
    say(from ? `Moved ${code} from ${termLabel(from)} to ${termLabel(term)}.` : `Added ${code} to ${termLabel(term)}.`);
    return null;
  };

  return (
    <section aria-labelledby={`${id}-h`} className="rounded border border-line p-4 sm:p-5" data-testid="plan">
      <h2 id={`${id}-h`} className="font-display text-xl font-bold text-heading">
        Four-year plan
      </h2>
      <p className="mt-1 max-w-3xl">
        Put the courses you still need into the terms ahead: type a code, drag a course from the requirements below, or use a course&apos;s Move to menu. Each
        requirement then says the term it&apos;s finished in. Courses in My courses count as already done.
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
            Already done: <span className="font-semibold tnum">{own.size}</span> course{own.size === 1 ? "" : "s"} in My courses (
            {fmtHours(done.hours, done.variable)}). Planned: <span className="font-semibold tnum">{fmtHours(planned.hours, planned.variable)}</span>
            {totalHours ? (
              <>
                , so {done.hours + planned.hours} of the {totalHours} hours to graduate
              </>
            ) : null}
            .{(done.unknown.length > 0 || planned.unknown.length > 0) && <> Hours unknown for {[...done.unknown, ...planned.unknown].join(", ")}.</>}
          </p>
          <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {terms.map((t) => (
              <Term
                key={t}
                term={t}
                terms={terms}
                plan={plan}
                setPlan={setPlan}
                place={place}
                nextTerm={nextTerm}
                hoursOf={hoursOf}
                titleOf={titleOf}
                patternOf={patternOf}
                prereqNote={prereqNote}
              />
            ))}
          </ol>
        </>
      )}
      <p className="sr-only" aria-live="polite" data-testid="plan-said">
        {said}
      </p>
    </section>
  );
}

function Term({
  term,
  terms,
  plan,
  setPlan,
  place,
  nextTerm,
  hoursOf,
  titleOf,
  patternOf,
  prereqNote,
}: {
  term: string;
  terms: string[];
  plan: MyState["plan"];
  setPlan: (p: MyState["plan"]) => void;
  place: (code: string, term: string) => string | null;
  nextTerm: string;
  hoursOf: (code: string) => [number, number] | null;
  titleOf: (code: string) => string;
  patternOf: (code: string) => string | undefined;
  prereqNote: (code: string, term: string) => string | null;
}) {
  const codes = plan.terms[term] ?? [];
  const h = termHours(codes, hoursOf);
  const name = termLabel(term);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const add = () => {
    const m = /^\s*([A-Za-z]{2,5})\s*-?\s*(\d{3})\s*$/.exec(text);
    if (!m) return setMsg("Type a course code like CS 225.");
    const code = `${m[1].toUpperCase()} ${m[2]}`;
    const where = plannedIn(plan, code);
    if (where) return setMsg(`${code} is already in ${termLabel(where)}. Use its Move to menu to move it.`);
    if (!titleOf(code)) return setMsg(`${code} isn't in the course data this site has. Check the code.`);
    const err = place(code, term);
    setMsg(err);
    if (!err) setText("");
  };
  const past = termIndex(term) < termIndex(nextTerm);
  const late = !!plan.grad && termIndex(term) > termIndex(plan.grad);
  const dragging = (e: React.DragEvent) => e.dataTransfer.types.includes(COURSE_DRAG);
  // the term's hours against the Registrar's limits (#82), as in the schedule builder (#116)
  const ranges = codes.map((c) => hoursOf(c) ?? undefined);
  const variable = codes.filter((c, i) => ranges[i] && ranges[i][0] !== ranges[i][1]);
  const hourNotes = hourWarnings(totalHours(ranges), codes.length, term, name, variable);
  return (
    <li
      className={`rounded p-3 ${over ? "bg-action-tint ring-2 ring-action" : "bg-panel"}`}
      data-testid="plan-term"
      data-term={term}
      onDragOver={(e) => {
        if (!dragging(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        const code = e.dataTransfer.getData(COURSE_DRAG);
        setOver(false);
        if (!code) return;
        e.preventDefault();
        setMsg(place(code, term));
      }}
    >
      <h3 className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-semibold text-heading">{name}</span>
        <span className="text-sm text-muted tnum" data-testid="term-hours">
          {codes.length ? fmtHours(h.hours, h.variable) : "No courses yet"}
        </span>
      </h3>
      {(past || late) && (
        <p className="mt-1 text-sm">
          {past ? "This term has started or passed: add what you took to My courses and remove it here." : "After your expected graduation."}
        </p>
      )}
      {hourNotes.map((w) => (
        <p key={w.kind} className="mt-1 flex items-start gap-1.5 text-sm" data-testid="plan-hours-warning" data-kind={w.kind}>
          <Icon name="alert" className="mt-0.5 shrink-0" />
          <span>
            {w.text}{" "}
            <a href={w.href} className="text-action underline hover:text-action-dark">
              Registrar&apos;s limits
            </a>
          </span>
        </p>
      ))}
      {codes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {codes.map((c) => {
            const cr = hoursOf(c);
            const offering = offeringWarning(patternOf(c), term, name);
            const pre = prereqNote(c, term);
            return (
              <li
                key={c}
                className="flex cursor-grab flex-wrap items-center gap-x-2 gap-y-1 rounded bg-white/60 px-1 active:cursor-grabbing"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(COURSE_DRAG, c);
                  e.dataTransfer.setData("text/plain", c);
                  e.dataTransfer.effectAllowed = "move";
                }}
                data-testid="plan-course"
                data-code={c}
              >
                <span className="min-w-0 grow basis-40">
                  <Link href={courseHref(...(c.split(" ") as [string, string]))} className="font-semibold text-action hover:underline" draggable={false}>
                    {c}
                  </Link>{" "}
                  <span className="text-sm text-muted">{titleOf(c)}</span>
                  {offering && (
                    <span className="mt-0.5 flex items-start gap-1 text-sm" data-testid="offering-warning">
                      <Icon name="alert" className="mt-0.5 shrink-0" />
                      {offering}
                    </span>
                  )}
                  {pre && (
                    <span className="mt-0.5 flex items-start gap-1 text-sm" data-testid="prereq-warning">
                      <Icon name="alert" className="mt-0.5 shrink-0" />
                      {pre}
                    </span>
                  )}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <span className="text-sm whitespace-nowrap text-muted tnum">{cr ? (cr[0] === cr[1] ? cr[0] : `${cr[0]}-${cr[1]}`) : "?"}</span>
                  {terms.length > 1 && (
                    <select
                      className="max-w-32 rounded border border-line bg-white px-1 py-0.5 text-sm"
                      value=""
                      aria-label={`Move ${c} to another term`}
                      onChange={(e) => e.target.value && setMsg(place(c, e.target.value))}
                    >
                      <option value="">Move to…</option>
                      {terms
                        .filter((t) => t !== term)
                        .map((t) => (
                          <option key={t} value={t}>
                            {termLabel(t)}
                          </option>
                        ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:bg-white hover:text-ink"
                    aria-label={`Remove ${c} from ${name}`}
                    onClick={() => setPlan(removeFromPlan(plan, c))}
                  >
                    <Icon name="x" />
                  </button>
                </span>
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
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded border border-action bg-white px-2 font-semibold text-action hover:bg-action-tint"
        >
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
