"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { looksLikeCrn, searchCrn, type CrnHit, type CrnIndex } from "@/lib/crn";
import { courseHref, dataUrl, fmtGpa, GENED_NAMES, termLabel } from "@/lib/format";
import { search, type SearchHit } from "@/lib/search";
import type { SearchIndex } from "@/lib/types";
import AddToCart from "./AddToCart";
import { Badge } from "./ui/Badge";
import CourseRow, { type CourseCols } from "./ui/CourseRow";
import Icon from "./ui/Icon";

const COLS: CourseCols = { gpa: true, next: true, action: true };
const COLS_NO_CART: CourseCols = { gpa: true, next: true };

function loader<T>(file: string): () => Promise<T> {
  let cache: Promise<T> | null = null;
  return () => {
    if (!cache) {
      cache = fetch(dataUrl(file)).then((r) => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return r.json() as Promise<T>;
      });
      cache.catch(() => (cache = null));
    }
    return cache;
  };
}
export const loadIndex = loader<SearchIndex>("search.json");
const loadCrns = loader<CrnIndex>("crns.json");

type Hit = SearchHit | { kind: "section"; section: CrnHit };

function hitKey(h: Hit): string {
  return h.kind === "course" ? `c-${h.course.s}${h.course.n}` : h.kind === "instructor" ? `i-${h.instructor.k}` : `s-${h.section.term}-${h.section.crn}`;
}

function hitHref(h: Hit): string {
  if (h.kind === "course") return courseHref(h.course.s, h.course.n);
  if (h.kind === "section") return `${courseHref(h.section.s, h.section.n)}#crn-${h.section.crn}`;
  const [s, n] = h.instructor.c[0]?.split(" ") ?? [];
  return s ? courseHref(s, n) : "/";
}

export default function SearchBox({
  nextTerm,
  autoFocus = false,
  withCart = true,
  placeholder = 'Try "cs124", a professor or a CRN',
  onPick,
}: {
  nextTerm: string;
  autoFocus?: boolean;
  withCart?: boolean;
  placeholder?: string;
  /** If set, Enter on a course (or a CRN, which also pins that section) adds it here instead of opening the course page. */
  onPick?: (subject: string, number: string, crn?: string) => void;
}) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [crns, setCrns] = useState<CrnIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e: Error) => setError(e.message));
  }, []);
  const wantCrns = looksLikeCrn(q);
  useEffect(() => {
    if (wantCrns && !crns)
      loadCrns()
        .then(setCrns)
        .catch(() => setCrns({}));
  }, [wantCrns, crns]);

  const hits: Hit[] = useMemo(() => {
    const sections: Hit[] = crns && wantCrns ? searchCrn(crns, q).map((section) => ({ kind: "section", section })) : [];
    return [...sections, ...(index ? search(index, q, 25) : [])].slice(0, 25);
  }, [index, crns, wantCrns, q]);
  const titleOf = useMemo(() => new Map((index?.courses ?? []).map((c) => [`${c.s} ${c.n}`, c.t])), [index]);
  useEffect(() => setActive(0), [q]);

  const pick = (h: Hit) => {
    if (onPick && h.kind === "course") {
      onPick(h.course.s, h.course.n);
      setQ("");
    } else if (onPick && h.kind === "section" && h.section.term === nextTerm) {
      onPick(h.section.s, h.section.n, h.section.crn);
      setQ("");
    } else router.push(hitHref(h));
  };

  return (
    <div>
      <label htmlFor="q" className="sr-only">
        Search courses, instructors or CRNs
      </label>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <input
          id="q"
          ref={inputRef}
          type="search"
          autoFocus={autoFocus}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              pick(hits[active]);
            }
          }}
          placeholder={placeholder}
          className="w-full rounded border-2 border-heading bg-white py-3 pr-4 pl-11 text-lg placeholder:text-muted focus:border-action focus:outline-none"
          aria-controls={hits.length ? "search-results" : undefined}
          aria-expanded={hits.length > 0}
          role="combobox"
          aria-autocomplete="list"
        />
      </div>
      {error && (
        <p className="mt-2 flex items-start gap-2" role="alert">
          <Icon name="alert" className="mt-1 text-down" />
          Search data couldn&apos;t load ({error}). Try reloading the page.
        </p>
      )}
      {!index && !error && q && <p className="mt-2 text-muted">Loading course list…</p>}
      {wantCrns && !crns && <p className="mt-2 text-muted">Looking up CRNs…</p>}
      {index && q.trim() && !hits.length && (!wantCrns || crns) && (
        <p className="mt-2 text-muted">
          {wantCrns ? `No section in ${termLabel(nextTerm)} or this term has CRN ${q.replace(/\D/g, "")}.` : <>No courses or instructors match &ldquo;{q}&rdquo;.</>}
        </p>
      )}
      {hits.length > 0 && (
        <ul id="search-results" className="mt-2 rounded border border-line bg-white px-3" role="listbox" aria-label="Search results">
          {hits.map((h, i) => (
            <li key={hitKey(h)} role="option" aria-selected={i === active} className={`-mx-3 px-3 ${i === active ? "bg-action-tint" : ""}`}>
              {h.kind === "section" ? (
                <SectionHit hit={h.section} title={titleOf.get(`${h.section.s} ${h.section.n}`) ?? ""} nextTerm={nextTerm} withCart={withCart} />
              ) : h.kind === "course" ? (
                <CourseRow
                  as="div"
                  subject={h.course.s}
                  number={h.course.n}
                  title={h.course.t}
                  cols={withCart ? COLS : COLS_NO_CART}
                  badges={
                    <>
                      {h.course.c && <Badge>{h.course.c} credit hours</Badge>}
                      {h.course.g.map((g) => (
                        <Badge key={g}>{GENED_NAMES[g] ?? g}</Badge>
                      ))}
                    </>
                  }
                  slots={{
                    gpa: { label: "Recent GPA", value: h.course.gpa !== null ? <span className="tnum font-semibold text-heading">{fmtGpa(h.course.gpa)}</span> : undefined },
                    next: { label: termLabel(nextTerm), value: h.course.nx ? "Offered" : <span className="text-muted">Not offered</span>, sub: termLabel(nextTerm) },
                  }}
                  action={withCart && h.course.nx ? <AddToCart subject={h.course.s} number={h.course.n} small /> : null}
                />
              ) : (
                <div className="border-b border-line py-3">
                  <p className="font-semibold text-heading">{h.instructor.name}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                    <span className="text-muted">Teaching in {termLabel(nextTerm)}:</span>
                    {h.instructor.c.map((c) => {
                      const [s, n] = c.split(" ");
                      return (
                        <Link key={c} href={courseHref(s, n)} className="font-semibold text-action hover:underline">
                          {c}
                        </Link>
                      );
                    })}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionHit({ hit, title, nextTerm, withCart }: { hit: CrnHit; title: string; nextTerm: string; withCart: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3" data-testid="crn-hit">
      <div className="min-w-0 flex-1">
        <Link href={`${courseHref(hit.s, hit.n)}#crn-${hit.crn}`} className="group">
          <span className="tnum font-semibold text-heading">CRN {hit.crn}</span>{" "}
          <span className="font-semibold text-action group-hover:underline">
            {hit.s} {hit.n}
          </span>{" "}
          <span className="group-hover:underline">{title}</span>
        </Link>
        <p className="text-sm text-muted">
          Section {hit.code}
          {hit.type ? `, ${hit.type.toLowerCase()}` : ""}, {termLabel(hit.term)}
        </p>
      </div>
      {withCart && hit.term === nextTerm && <AddToCart subject={hit.s} number={hit.n} lock={hit.crn} small />}
    </div>
  );
}
