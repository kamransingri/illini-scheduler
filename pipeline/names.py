"""One instructor identity across Course Explorer, the GPA dataset and Rate My Professors.

Sources spell the same person differently:
    Course Explorer  "Erickson, J"           (last, first initial)
    GPA dataset      "Erickson, Jeff G"      (last, first + middle; last names truncated to 15 chars)
    RMP              "Jeff Erickson"         (first last)

`parse_name` normalises any of these to NameParts(last, first_initial, first_name?). `instructor_key`
produces the stable key: "last|first" when a first name is known, otherwise "last|initial".
`InstructorMatcher` links Course Explorer names to GPA-dataset identities and logs what it can't link.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "phd", "md"}
# Match methods that say who the name is in the whole subject, so a name's other courses there can take the same
# person. "cross-listed" and "meets-with" are evidence for one course only: GWS 240 is CLCV 240, which Craig
# Williams teaches, but that says nothing about the "Williams, C" who teaches GWS 202 (#12).
SPREADS = {"subject", "recent-course", "override", "global-unique"}
GPA_LAST_TRUNC = 15  # the GPA dataset truncates "Primary Instructor" last names at 15 characters


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _clean(s: str) -> str:
    s = strip_accents(s).lower()
    s = re.sub(r"[^a-z\-' ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _key(s: str) -> str:
    """Comparison key for a name part: letters only ('Fagen-Ulmschneider' -> 'fagenulmschneider')."""
    return re.sub(r"[^a-z]", "", s)


@dataclass(frozen=True)
class NameParts:
    last: str                 # comparison key, letters only
    first_initial: str        # '' when unknown
    first_name: str | None    # letters only, None when only an initial is known
    display: str              # 'Jeff Erickson' / 'J. Erickson'
    truncated: bool = False   # raw last name is exactly 15 chars, i.e. possibly cut off by the GPA dataset

    @property
    def key(self) -> str:
        return instructor_key(self)


def parse_name(raw: str) -> NameParts | None:
    """Parse 'Last, First M', 'Last, F', 'First Last', 'First M. Last'. Returns None for blanks/'TBA'."""
    if not raw or not raw.strip() or raw.strip().upper() in {"TBA", "STAFF", "N.A."}:
        return None
    raw = raw.strip()
    if "," in raw:
        last_raw, _, rest = raw.partition(",")
        given = [t for t in _clean(rest).split() if t.strip("'-") and _key(t) not in SUFFIXES]
        last_tokens = [t for t in _clean(last_raw).split() if _key(t) not in SUFFIXES]
    else:
        tokens = [t for t in _clean(raw).split() if _key(t) not in SUFFIXES]
        if not tokens:
            return None
        last_tokens, given = tokens[-1:], tokens[:-1]
    last = _key("".join(last_tokens))
    if not last:
        return None
    first_tok = _key(given[0]) if given else ""
    first_name = first_tok if len(first_tok) > 1 else None
    initial = first_tok[:1]
    pretty_last = raw.split(",")[0].strip() if "," in raw else raw.split()[-1]
    # The GPA dataset cuts the whole "Last, First M" field at 25 chars: a lone first name may be clipped.
    first_clipped = len(raw) == 25 and len(given) == 1
    if first_name and not first_clipped:
        first_disp = (given[0].strip("'-")).title()
        display = f"{first_disp} {pretty_last}"
    elif initial:
        display = f"{initial.upper()}. {pretty_last}"
    else:
        display = pretty_last
    raw_last = raw.split(",")[0].strip() if "," in raw else ""
    return NameParts(last=last, first_initial=initial, first_name=first_name, display=display,
                     truncated=len(raw_last) == GPA_LAST_TRUNC)


def instructor_key(p: NameParts) -> str:
    return f"{p.last}|{p.first_name or p.first_initial}"


def last_compatible(a: NameParts, b: NameParts) -> bool:
    """Equal, or one is the GPA dataset's 15-char truncation of the other (compared on letters)."""
    if a.last == b.last:
        return True
    short, long_ = sorted((a, b), key=lambda p: len(p.last))
    return short.truncated and len(short.last) >= 8 and long_.last.startswith(short.last)


def first_compatible(a: NameParts, b: NameParts) -> bool:
    if not a.first_initial or not b.first_initial:
        return True
    if a.first_initial != b.first_initial:
        return False
    if a.first_name and b.first_name:
        # 'jeff' vs 'jeffrey', 'chris' vs 'christopher'
        return a.first_name.startswith(b.first_name) or b.first_name.startswith(a.first_name)
    return True


def compatible(a: NameParts, b: NameParts) -> bool:
    return last_compatible(a, b) and first_compatible(a, b)


@dataclass
class Candidate:
    parts: NameParts
    raw: str
    courses: dict[tuple[str, str], str]  # (subject, number) -> last term taught


class InstructorMatcher:
    """Index of GPA-dataset identities per subject; matches Course Explorer names against it."""

    def __init__(self, overrides: dict[tuple[str, str], str] | None = None):
        self.by_subject: dict[str, dict[str, Candidate]] = defaultdict(dict)
        self.global_by_last: dict[str, list[tuple[str, Candidate]]] = defaultdict(list)
        self.overrides = overrides or {}
        self.unmatched: list[dict[str, str]] = []

    def add(self, raw: str, subject: str, number: str, term: str) -> str | None:
        p = parse_name(raw)
        if p is None:
            return None
        cands = self.by_subject[subject]
        c = cands.get(p.key)
        if c is None:
            c = cands[p.key] = Candidate(p, raw, {})
            self.global_by_last[p.last[:8]].append((subject, c))
        prev = c.courses.get((subject, number))
        if prev is None or term_order(term) > term_order(prev):
            c.courses[(subject, number)] = term
        return p.key

    def match(self, raw: str, subject: str, number: str, term: str = "",
              cross: Sequence[tuple[str, str]] = (), log: bool = True) -> tuple[str | None, str]:
        """Return (instructor_key or None, method). Logs ambiguous / unmatched names (unless `log` is False).

        `cross`: the courses the catalog says this one is the same as ("MATH 464: Same as STAT 410."), whose grades
        the GPA dataset may record under the other subject only.
        """
        p = parse_name(raw)
        if p is None:
            return None, "blank"
        if (subject, raw) in self.overrides:
            return self.overrides[(subject, raw)], "override"
        courses = [(subject, number), *cross]
        cands = [c for c in self.by_subject.get(subject, {}).values() if compatible(p, c.parts)]
        if not cands:
            # Cross-listed courses are often recorded under one subject only; accept a unique global match, or the
            # one candidate who taught this course or a cross-listed twin most recently.
            pool = {id(c): c for _s, c in self.global_by_last.get(p.last[:8], [])
                    if compatible(p, c.parts)}
            uniq = {c.parts.key: c for c in pool.values()}
            if len(uniq) == 1:
                return next(iter(uniq)), "global-unique"
            best = _latest_teacher(list(pool.values()), courses) if cross else None
            if best is not None:
                return best, "cross-listed"
            if log:
                self._log(raw, subject, number, term,
                          "no candidate" if not uniq else f"{len(uniq)} global candidates")
            return None, "unmatched"
        if len({c.parts.key for c in cands}) == 1:
            return cands[0].parts.key, "subject"
        # Tie-break: whoever taught this exact course (or a cross-listed twin) most recently.
        best = _latest_teacher(cands, courses)
        if best is not None:
            return best, "recent-course"
        if log:
            self._log(raw, subject, number, term, "ambiguous: " + "; ".join(sorted(c.raw for c in cands)))
        return None, "ambiguous"

    def match_courses(self, raw: str, subject: str, taught: Sequence[tuple[str, str]],
                      cross_of: Mapping[tuple[str, str], Sequence[tuple[str, str]]] | None = None,
                      ) -> dict[str, tuple[str | None, str]]:
        """Match one Course Explorer name in one subject using every course it teaches (`taught`: (number, term),
        the one to report first). Returns course number -> (instructor key or None, method).

        Each course is tried on its own. When the courses that resolve all point to one person, and at least one did
        so by evidence about the whole subject (SPREADS), every course gets that person, so the first course listed
        no longer decides alone ("Wang, S" in STAT: STAT 428 resolves, STAT 578 doesn't). When they point to
        different people, one Course Explorer name is two people in this subject ("Li, H" in HIST is Haiyi Li in
        HIST 120 and Hanping Li in HIST 100): each course keeps its own match. A course that doesn't resolve then
        stays unlinked, and is logged."""
        cross_of = cross_of or {}
        per = {n: self.match(raw, subject, n, t, cross_of.get((subject, n), ()), log=False) for n, t in taught}
        if any(m == "blank" for _k, m in per.values()):
            return {n: (None, "blank") for n in per}
        keys = {k for k, _m in per.values() if k is not None}
        general = [m for k, m in per.values() if k is not None and m in SPREADS]
        if len(keys) == 1 and general:
            key = keys.pop()
            return {n: (key, m if k is not None else general[0]) for n, (k, m) in per.items()}
        out = dict(per)
        for n, t in taught:
            if per[n][0] is not None:
                continue
            if len(keys) > 1:
                self._log(raw, subject, n, t, "courses name different people: " + "; ".join(sorted(keys)))
                out[n] = (None, "ambiguous")
            elif keys or n == taught[0][0]:  # log why it didn't resolve
                out[n] = self.match(raw, subject, n, t, cross_of.get((subject, n), ()))
        return out

    def _log(self, raw: str, subject: str, number: str, term: str, reason: str) -> None:
        self.unmatched.append({"source": "course-explorer", "raw_name": raw, "subject": subject,
                               "number": number, "term": term, "reason": reason})

    def unlog(self, raw: str, subject: str, number: str) -> None:
        """Drop the log for a course that was linked after all (instructors.meets_with)."""
        self.unmatched = [u for u in self.unmatched
                          if (u["raw_name"], u["subject"], u["number"]) != (raw, subject, number)]

    def write_unmatched(self, path: Path) -> int:
        seen = set()
        rows = []
        for r in self.unmatched:
            k = (r["raw_name"], r["subject"], r["number"])
            if k not in seen:
                seen.add(k)
                rows.append(r)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=["source", "raw_name", "subject", "number", "term", "reason"])
            w.writeheader()
            w.writerows(sorted(rows, key=lambda r: (r["subject"], r["number"], r["raw_name"])))
        return len(rows)


def _latest_teacher(cands: Sequence[Candidate], courses: Sequence[tuple[str, str]]) -> str | None:
    """The one candidate who taught any of `courses` most recently, or None when nobody did or two tie."""
    last: dict[str, int] = {}
    for c in cands:
        t = max((term_order(c.courses[k]) for k in courses if k in c.courses), default=0)
        if t:
            last[c.parts.key] = max(t, last.get(c.parts.key, 0))
    ranked = sorted(last.items(), key=lambda kv: kv[1], reverse=True)
    if ranked and (len(ranked) == 1 or ranked[0][1] > ranked[1][1]):
        return ranked[0][0]
    return None


def load_aliases(conn) -> dict[tuple[str, str, str], str]:  # type: ignore[no-untyped-def]
    """instructor_aliases as (raw name, subject, course number or "") -> instructor key."""
    return {(r[0], r[1], r[2]): r[3] for r in conn.execute(
        "SELECT raw_name, subject, number, instructor_key FROM instructor_aliases")}


def alias_key(aliases: Mapping[tuple[str, str, str], str], raw: str, subject: str, number: str = "") -> str | None:
    """A Course Explorer name's identity in one course: the course's own link when the name is two people in this
    subject, else the subject's."""
    return aliases.get((raw, subject, number)) or aliases.get((raw, subject, ""))


SAME_AS = re.compile(r"Same as ([^.]*)\.")
COURSE_CODE = re.compile(r"\b([A-Z]{2,5}) (\d{3})\b")


def cross_listings(descriptions: Iterable[tuple[str, str, str]]) -> dict[tuple[str, str], list[tuple[str, str]]]:
    """(subject, number, catalog description) -> each course's cross-listed twins, both ways, from the catalog's
    "Same as STAT 410." sentence."""
    out: dict[tuple[str, str], set[tuple[str, str]]] = defaultdict(set)
    for subject, number, text in descriptions:
        for clause in SAME_AS.findall(text or ""):
            for other in COURSE_CODE.findall(clause):
                if other != (subject, number):
                    out[(subject, number)].add(other)
                    out[other].add((subject, number))
    return {k: sorted(v) for k, v in out.items()}


def term_order(term: str) -> int:
    """'2026-fa' -> sortable int. Accepts '' (-> 0)."""
    if not term:
        return 0
    year, code = term.split("-")
    return int(year) * 10 + {"wi": 0, "sp": 1, "su": 2, "fa": 3}[code]


def load_overrides(path: Path) -> dict[tuple[str, str], str]:
    """data/name_overrides.csv: subject,raw_name,instructor_key,source. Every row must cite its source (#12)."""
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if not (r.get("subject") or "").startswith("#")]
    missing = [f"{r['subject']} {r['raw_name']}" for r in rows if not (r.get("source") or "").strip()]
    if missing:
        raise ValueError(f"{path.name}: rows without a source: {', '.join(missing)}")
    return {(r["subject"], r["raw_name"]): r["instructor_key"] for r in rows}


def _pct(a: int, b: int) -> str:
    return f"{100 * a / b:5.1f}%" if b else "    -"


def report(conn, matcher: InstructorMatcher, subjects: Sequence[str] = (), top: int = 20) -> str:  # type: ignore[no-untyped-def]
    """Next term's match rate per subject (lecture names and all names), and the lecture names still unlinked in
    `subjects`, most sections first, with the reason logged for each."""
    from .instructors import match_course_explorer, match_stats, split_raw

    rows, links = match_course_explorer(conn, matcher)
    stats = match_stats(rows, links)
    out = [f"{'subject':8} {'lectures':>8} {'linked':>6} {'rate':>6}   {'all names':>9} {'rate':>6}"]
    shown = sorted(stats) if not subjects else [s for s in subjects if s in stats]
    for s in shown:
        m, n, pm, pn = stats[s]
        out.append(f"{s:8} {pn:8} {pm:6} {_pct(pm, pn)}   {n:9} {_pct(m, n)}")
    tot = [sum(v[i] for v in stats.values()) for i in range(4)]
    out.append(f"{'all':8} {tot[3]:8} {tot[2]:6} {_pct(tot[2], tot[3])}   {tot[1]:9} {_pct(tot[0], tot[1])}")
    reasons = {(u["raw_name"], u["subject"]): u["reason"] for u in matcher.unmatched}
    from .fetch import NEXT_TERM

    for s in subjects:
        count: dict[str, set[str]] = defaultdict(set)
        for r in rows:
            if r["term"] == NEXT_TERM and r["subject"] == s and r["component"] == "primary":
                for raw in split_raw(r["instructors_raw"]):
                    if links.get((raw, s), {}).get(r["number"], (None, "blank"))[1] in ("unmatched", "ambiguous"):
                        count[raw].add(r["number"])
        out.append("")
        out.append(f"{s}: {len(count)} lecture names not linked" + (":" if count else ""))
        for raw, nums in sorted(count.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:top]:
            out.append(f"  {raw:28} {', '.join(sorted(nums)):18} {reasons.get((raw, s), '')}")
    return "\n".join(out)


def main(argv: Sequence[str] | None = None) -> int:
    """python -m pipeline.names --report [--subjects CS,MATH,STAT]: how many Course Explorer names link to the GPA
    dataset (issue #12), from data/illini.db and the cached GPA dataset."""
    import argparse
    import sqlite3

    from . import gpa, renumbered
    from .config import DATA, DB_PATH
    from .fetch import WADE_DIR

    ap = argparse.ArgumentParser(description=main.__doc__)
    ap.add_argument("--report", action="store_true", help="print the match rate per subject")
    ap.add_argument("--subjects", default="", help="also list the unlinked lecture names in these subjects")
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args(argv)
    if not args.report:
        ap.print_help()
        return 0
    df = gpa.load_gpa_csv(WADE_DIR / "gpa" / "uiuc-gpa-dataset.csv")
    df = gpa.matcher_frame(df, renumbered.apply_gpa(df, renumbered.Renamer(renumbered.load())))
    matcher = gpa.build_matcher(df, load_overrides(DATA / "name_overrides.csv"))
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    subjects = [s.strip().upper() for s in args.subjects.split(",") if s.strip()]
    print(report(conn, matcher, subjects, args.top))
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
