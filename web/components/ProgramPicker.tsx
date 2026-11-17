"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DegreeIndex } from "@/lib/degree";
import { byCollege, searchPrograms, type Program } from "@/lib/programs";
import Icon from "./ui/Icon";

const optId = (p: Program) => `program-opt-${p.id}`;

/**
 * Pick one of ~170 programs by typing part of its name ("finance", "cs", "mcb", "gies"), or browse them all grouped by
 * college. A combobox: arrow keys move, Enter picks, Escape puts the current program back.
 */
export default function ProgramPicker({ programs, value, onChange }: { programs: DegreeIndex; value: string; onChange: (id: string) => void }) {
  const selected = programs.find((p) => p.id === value);
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState(false); // false: show the whole list (just focused, nothing typed yet)
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const searching = typed && q.trim() !== "";
  const hits = useMemo(() => (searching ? searchPrograms(programs, q) : []), [programs, q, searching]);
  const groups = useMemo(() => byCollege(programs), [programs]);
  const shown = searching ? hits : groups.flatMap((g) => g.programs);
  const current = open ? shown[Math.min(active, shown.length - 1)] : undefined;

  // on opening, the current program sits in the middle of the list; after that the highlight just stays in view
  const centre = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = current && document.getElementById(optId(current));
    if (el && list.current && centre.current) list.current.scrollTop = el.offsetTop - (list.current.clientHeight - el.offsetHeight) / 2;
    else if (el) el.scrollIntoView({ block: "nearest" });
    centre.current = false;
  }, [current]);

  const openList = () => {
    setQ(selected?.program ?? "");
    setTyped(false);
    setActive(Math.max(0, groups.flatMap((g) => g.programs).findIndex((p) => p.id === value)));
    centre.current = true;
    setOpen(true);
  };
  const pick = (p: Program, keepFocus: boolean) => {
    onChange(p.id);
    setOpen(false);
    setTyped(false);
    if (keepFocus) requestAnimationFrame(() => input.current?.select());
    else input.current?.blur();
  };

  const option = (p: Program, withCollege: boolean) => {
    const isActive = p === current;
    return (
      <div
        key={p.id}
        id={optId(p)}
        role="option"
        aria-selected={p.id === value}
        data-active={isActive || undefined}
        className={`flex cursor-pointer items-start gap-2 px-3 py-1.5 ${isActive ? "bg-action-tint" : "hover:bg-panel"}`}
        onMouseDown={(e) => e.preventDefault()} // keep focus in the input
        onMouseMove={() => setActive(shown.indexOf(p))}
        onClick={() => pick(p, false)}
      >
        <Icon name="check" className={`mt-1 ${p.id === value ? "text-heading" : "invisible"}`} />
        <span className="min-w-0">
          <span className={p.id === value ? "font-semibold text-heading" : ""}>{p.program}</span>
          {withCollege && <span className="block text-sm text-muted">{p.college}</span>}
        </span>
      </div>
    );
  };

  return (
    <div className="relative">
      <label htmlFor="program-search" className="font-semibold text-heading">
        Program
      </label>
      <div className="relative mt-1">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <input
          ref={input}
          id="program-search"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? "program-list" : undefined}
          aria-autocomplete="list"
          aria-activedescendant={current ? optId(current) : undefined}
          aria-describedby={selected ? "program-college" : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={`Search ${programs.length} programs`}
          className="block w-full rounded border border-line bg-white py-1.5 pr-8 pl-8 focus:border-action focus:outline-none"
          value={open ? q : (selected?.program ?? "")}
          onFocus={(e) => {
            openList();
            e.currentTarget.select();
          }}
          onClick={() => !open && openList()}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQ(e.target.value);
            setTyped(true);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) return openList();
              const last = shown.length - 1;
              setActive((a) => (e.key === "ArrowDown" ? Math.min(a + 1, last) : Math.max(a - 1, 0)));
            } else if (e.key === "Enter" && open && current) {
              e.preventDefault();
              pick(current, true);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              setOpen(false);
              setTyped(false);
              requestAnimationFrame(() => input.current?.select()); // typing next replaces the name
            }
          }}
        />
        <Icon name="chevronDown" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
      </div>
      {selected && (
        <p id="program-college" className="mt-1 text-sm text-muted">
          {selected.college}, {selected.catalog_year} catalog
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {open && searching ? `${hits.length} program${hits.length === 1 ? "" : "s"} found` : ""}
      </p>
      {open && (
        <div className="absolute inset-x-0 z-30 mt-1 rounded border border-heading bg-white shadow-lg lg:right-auto lg:w-[30rem]">
          <p className="border-b border-line px-3 py-1.5 text-sm text-muted">
            {searching
              ? hits.length
                ? `${hits.length} of ${programs.length} programs`
                : `No program matches “${q.trim()}”. Try one word of its name, like “economics”, or its college.`
              : `All ${programs.length} programs by college. Type to search by name, acronym (CS, MCB) or college.`}
          </p>
          <div ref={list} id="program-list" role="listbox" aria-label="Programs" className="relative max-h-80 overflow-y-auto py-1" data-testid="program-list">
            {searching
              ? hits.map((p) => option(p, true))
              : groups.map((g, i) => (
                  <div key={g.college} role="group" aria-labelledby={`program-college-${i}`}>
                    <div id={`program-college-${i}`} role="presentation" className="sticky top-0 bg-panel px-3 py-1 text-sm font-semibold text-heading">
                      {g.college}
                    </div>
                    {g.programs.map((p) => option(p, false))}
                  </div>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}
