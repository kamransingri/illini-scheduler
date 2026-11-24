"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DegreeIndex } from "@/lib/degree";
import { byCollege, searchPrograms, shortCollege, type Program } from "@/lib/programs";
import Icon from "./ui/Icon";

/**
 * Pick one program (a major or a minor) by typing part of its name ("finance", "cs", "mcb", "gies"), or narrow the
 * list to one college and browse it. A combobox: the box starts empty so typing searches straight away, arrow keys
 * move, Enter picks, Escape puts the current program back. `clearable` adds a button that picks nothing (minors).
 */
export default function ProgramPicker({
  programs,
  value,
  onChange,
  label,
  idPrefix,
  noun,
  hint,
  clearable = false,
  disabledReason,
}: {
  programs: DegreeIndex;
  value: string;
  onChange: (id: string) => void;
  label: React.ReactNode;
  idPrefix: string;
  noun: [string, string]; // singular, plural: ["major", "majors"]
  hint: string; // example searches, for the empty box: "finance, CS, MCB"
  clearable?: boolean;
  disabledReason?: (program: Program) => string | null;
}) {
  const selected = programs.find((p) => p.id === value);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [college, setCollege] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const optId = (p: Program) => `${idPrefix}-opt-${p.id}`;

  const allGroups = useMemo(() => byCollege(programs), [programs]);
  const pool = useMemo(() => (college ? programs.filter((p) => p.college === college) : programs), [programs, college]);
  const searching = q.trim() !== "";
  const hits = useMemo(() => (searching ? searchPrograms(pool, q) : []), [pool, q, searching]);
  const groups = useMemo(() => (college ? allGroups.filter((g) => g.college === college) : allGroups), [allGroups, college]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const openList = (inCollege = college) => {
    setQ("");
    const browse = (inCollege ? allGroups.filter((g) => g.college === inCollege) : allGroups).flatMap((g) => g.programs);
    setActive(Math.max(0, browse.findIndex((p) => p.id === value)));
    centre.current = true;
    setOpen(true);
  };
  const pick = (p: Program | null, keepFocus: boolean) => {
    onChange(p?.id ?? "");
    setOpen(false);
    setQ("");
    if (keepFocus) requestAnimationFrame(() => input.current?.focus());
    else input.current?.blur();
  };

  const option = (p: Program, withCollege: boolean) => {
    const isActive = p === current;
    const reason = disabledReason?.(p) ?? null;
    return (
      <div
        key={p.id}
        id={optId(p)}
        role="option"
        aria-selected={p.id === value}
        aria-disabled={reason ? true : undefined}
        data-active={isActive || undefined}
        className={`flex items-start gap-2 px-3 py-1.5 ${reason ? "cursor-not-allowed text-muted opacity-60" : "cursor-pointer"} ${isActive ? "bg-action-tint" : !reason ? "hover:bg-panel" : ""}`}
        onMouseDown={(e) => e.preventDefault()} // keep focus in the input
        onMouseMove={() => !reason && setActive(shown.indexOf(p))}
        onClick={() => !reason && pick(p, false)}
      >
        <Icon name="check" className={`mt-1 ${p.id === value ? "text-heading" : "invisible"}`} />
        <span className="min-w-0">
          <span className={p.id === value ? "font-semibold text-heading" : ""}>{p.program}</span>
          {withCollege && <span className="block text-sm text-muted">{p.college}</span>}
          {reason && <span className="block text-sm">Not open to {reason}</span>}
        </span>
      </div>
    );
  };

  const inCollege = college ? ` in ${shortCollege(college)}` : "";
  return (
    <div className="relative">
      <label htmlFor={`${idPrefix}-search`} className="font-semibold text-heading">
        {label}
      </label>
      <div className="relative mt-1">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <input
          ref={input}
          id={`${idPrefix}-search`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? `${idPrefix}-list` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={current ? optId(current) : undefined}
          aria-describedby={selected ? `${idPrefix}-college` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={open ? `Type a ${noun[0]}: ${hint}` : `Search ${programs.length} ${noun[1]}`}
          className={`block w-full rounded border border-line bg-white py-1.5 pl-8 placeholder:text-muted focus:border-action focus:outline-none ${clearable && selected ? "pr-16" : "pr-8"}`}
          value={open ? q : (selected?.program ?? "")}
          onFocus={() => openList()}
          onClick={() => !open && openList()}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) return openList();
              const last = shown.length - 1;
              setActive((a) => (e.key === "ArrowDown" ? Math.min(a + 1, last) : Math.max(a - 1, 0)));
            } else if (e.key === "Enter" && open && current && !disabledReason?.(current)) {
              e.preventDefault();
              pick(current, true);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              setOpen(false);
              setQ("");
              requestAnimationFrame(() => input.current?.select()); // typing next replaces the name
            }
          }}
        />
        {clearable && selected && !open && (
          <button
            type="button"
            className="absolute top-1/2 right-7 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted hover:text-action"
            aria-label={`Remove ${selected.program}`}
            onClick={() => pick(null, false)}
          >
            <Icon name="x" />
          </button>
        )}
        <Icon name="chevronDown" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
        {open && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 rounded border border-heading bg-white shadow-lg lg:right-auto lg:w-[30rem]">
            <p className="border-b border-line px-3 py-1.5 text-sm text-muted">
              {searching
                ? hits.length
                  ? `${hits.length} of ${pool.length} ${noun[1]}${inCollege}`
                  : `No ${noun[0]} matches “${q.trim()}”${inCollege}. Try one word of its name, like “economics”${college ? ", or All colleges" : ", or its college"}.`
                : college
                  ? `${pool.length} ${noun[1]} in ${shortCollege(college)}. Type to search them.`
                  : `All ${programs.length} ${noun[1]} by college. Type to search by name, acronym (CS, MCB) or college.`}
            </p>
            <div ref={list} id={`${idPrefix}-list`} role="listbox" aria-label={noun[1][0].toUpperCase() + noun[1].slice(1)} className="relative max-h-80 overflow-y-auto py-1" data-testid={`${idPrefix}-list`}>
              {searching
                ? hits.map((p) => option(p, !college))
                : groups.map((g, i) => (
                    <div key={g.college} role="group" aria-labelledby={`${idPrefix}-college-${i}`}>
                      <div id={`${idPrefix}-college-${i}`} role="presentation" className="sticky top-0 bg-panel px-3 py-1 text-sm font-semibold text-heading">
                        {g.college}
                      </div>
                      {g.programs.map((p) => option(p, false))}
                    </div>
                  ))}
            </div>
          </div>
        )}
      </div>
      {selected && (
        <p id={`${idPrefix}-college`} className="mt-1 text-sm text-muted">
          {selected.college}, {selected.catalog_year} catalog
        </p>
      )}
      <label className="mt-1.5 flex items-center gap-2 text-sm text-muted">
        <span className="shrink-0">College</span>
        <select
          className="min-w-0 flex-1 rounded border border-line bg-white px-1.5 py-1 text-ink"
          value={college}
          aria-label={`Show ${noun[1]} from one college`}
          onChange={(e) => {
            setCollege(e.target.value);
            input.current?.focus();
            openList(e.target.value);
          }}
        >
          <option value="">All colleges ({programs.length})</option>
          {allGroups.map((g) => (
            <option key={g.college} value={g.college}>
              {shortCollege(g.college)} ({g.programs.length})
            </option>
          ))}
        </select>
      </label>
      <p className="sr-only" aria-live="polite">
        {open && searching ? `${hits.length} ${hits.length === 1 ? noun[0] : noun[1]} found${inCollege}` : ""}
      </p>
    </div>
  );
}
