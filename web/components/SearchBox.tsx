"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { courseHref, dataUrl, fmtGpa, GENED_NAMES, termLabel } from "@/lib/format";
import { search, type SearchHit } from "@/lib/search";
import type { SearchIndex } from "@/lib/types";
import AddToCart from "./AddToCart";
import { Badge } from "./ui/Badge";
import CourseRow, { type CourseCols } from "./ui/CourseRow";
import Icon from "./ui/Icon";

const COLS: CourseCols = { gpa: true, next: true, action: true };
const COLS_NO_CART: CourseCols = { gpa: true, next: true };

let cache: Promise<SearchIndex> | null = null;
export function loadIndex(): Promise<SearchIndex> {
  if (!cache) {
    cache = fetch(dataUrl("search.json")).then((r) => {
      if (!r.ok) throw new Error(`search index: HTTP ${r.status}`);
      return r.json() as Promise<SearchIndex>;
    });
    cache.catch(() => (cache = null));
  }
  return cache;
}

function hitHref(h: SearchHit): string {
  if (h.kind === "course") return courseHref(h.course.s, h.course.n);
  const [s, n] = h.instructor.c[0]?.split(" ") ?? [];
  return s ? courseHref(s, n) : "/";
}

export default function SearchBox({
  nextTerm,
  autoFocus = false,
  withCart = true,
  placeholder = 'Try "cs124", "CS 124", "intro to computer science" or an instructor',
  onPick,
}: {
  nextTerm: string;
  autoFocus?: boolean;
  withCart?: boolean;
  placeholder?: string;
  /** If set, Enter on a course adds it here instead of opening the course page. */
  onPick?: (subject: string, number: string) => void;
}) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e: Error) => setError(e.message));
  }, []);

  const hits = useMemo(() => (index ? search(index, q, 25) : []), [index, q]);
  useEffect(() => setActive(0), [q]);

  return (
    <div>
      <label htmlFor="q" className="sr-only">
        Search courses or instructors
      </label>
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
            const h = hits[active];
            if (onPick && h.kind === "course") {
              onPick(h.course.s, h.course.n);
              setQ("");
            } else router.push(hitHref(h));
          }
        }}
        placeholder={placeholder}
        className="w-full rounded border-2 border-heading bg-white px-4 py-3 text-lg placeholder:text-muted focus:border-action focus:outline-none"
        aria-controls={hits.length ? "search-results" : undefined}
        aria-expanded={hits.length > 0}
        role="combobox"
        aria-autocomplete="list"
      />
      {error && (
        <p className="mt-2 flex items-start gap-2" role="alert">
          <Icon name="alert" className="mt-1 text-down" />
          Search data couldn&apos;t load ({error}). Try reloading the page.
        </p>
      )}
      {!index && !error && q && <p className="mt-2 text-muted">Loading course list…</p>}
      {index && q.trim() && !hits.length && <p className="mt-2 text-muted">No courses or instructors match &ldquo;{q}&rdquo;.</p>}
      {hits.length > 0 && (
        <ul id="search-results" className="mt-2 rounded border border-line bg-white px-3" role="listbox" aria-label="Search results">
          {hits.map((h, i) => (
            <li
              key={h.kind === "course" ? `c-${h.course.s}${h.course.n}` : `i-${h.instructor.k}`}
              role="option"
              aria-selected={i === active}
              className={`-mx-3 px-3 ${i === active ? "bg-action-tint" : ""}`}
            >
              {h.kind === "course" ? (
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
