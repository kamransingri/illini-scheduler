"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { courseHref, dataUrl, fmtGpa, termLabel } from "@/lib/format";
import { search, type SearchHit } from "@/lib/search";
import type { SearchIndex } from "@/lib/types";
import AddToCart from "./AddToCart";

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
}: {
  nextTerm: string;
  autoFocus?: boolean;
  withCart?: boolean;
  placeholder?: string;
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
            router.push(hitHref(hits[active]));
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-white px-4 py-3 text-base shadow-sm focus:border-brand focus:outline-none"
        aria-controls="search-results"
      />
      {error && (
        <p className="mt-2 text-sm text-bad" role="alert">
          Search data couldn&apos;t load ({error}). Try reloading the page.
        </p>
      )}
      {!index && !error && q && <p className="mt-2 text-sm text-muted">Loading course list…</p>}
      {index && q && !hits.length && <p className="mt-2 text-sm text-muted">No courses or instructors match “{q}”.</p>}
      {hits.length > 0 && (
        <ul
          id="search-results"
          className="mt-2 divide-y divide-line rounded-lg border border-line bg-white"
          role="listbox"
          aria-label="Search results"
        >
          {hits.map((h, i) => (
            <li
              key={h.kind === "course" ? `c-${h.course.s}${h.course.n}` : `i-${h.instructor.k}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "bg-panel" : ""}
            >
              {h.kind === "course" ? (
                <div className="flex items-center gap-3 px-3 py-2">
                  <Link href={hitHref(h)} className="min-w-0 flex-1 no-underline">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">
                        {h.course.s} {h.course.n}
                      </span>
                      <span className="truncate">{h.course.t}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {h.course.c && <span>{h.course.c} cr</span>}
                      <span>GPA {fmtGpa(h.course.gpa)}</span>
                      <span className={h.course.nx ? "text-good" : ""}>
                        {termLabel(nextTerm)}: {h.course.nx ? "offered" : "not offered"}
                      </span>
                      {h.course.g.map((g) => (
                        <span key={g} className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-dark">
                          {g}
                        </span>
                      ))}
                    </div>
                  </Link>
                  {withCart && h.course.nx ? <AddToCart subject={h.course.s} number={h.course.n} small /> : null}
                </div>
              ) : (
                <div className="px-3 py-2">
                  <div className="font-semibold">{h.instructor.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted">
                    <span>Teaching {termLabel(nextTerm)}:</span>
                    {h.instructor.c.map((c) => {
                      const [s, n] = c.split(" ");
                      return (
                        <Link key={c} href={courseHref(s, n)} className="text-brand-dark underline">
                          {c}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
