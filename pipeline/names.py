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
from dataclasses import dataclass
from pathlib import Path

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "phd", "md"}
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
    if first_name:
        first_disp = (given[0].strip("'-")).title()
        display = f"{first_disp} {pretty_last}"
    elif initial:
        display = f"{initial.upper()}. {pretty_last}"
    else:
        display = pretty_last
    return NameParts(last=last, first_initial=initial, first_name=first_name, display=display)


def instructor_key(p: NameParts) -> str:
    return f"{p.last}|{p.first_name or p.first_initial}"


def last_compatible(a: str, b: str) -> bool:
    """Equal, or one is the GPA dataset's 15-char truncation of the other (compared on letters)."""
    if a == b:
        return True
    short, long_ = sorted((a, b), key=len)
    return len(short) >= GPA_LAST_TRUNC - 2 and long_.startswith(short)


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
    return last_compatible(a.last, b.last) and first_compatible(a, b)


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
            self.global_by_last[p.last[:GPA_LAST_TRUNC - 2]].append((subject, c))
        prev = c.courses.get((subject, number))
        if prev is None or term_order(term) > term_order(prev):
            c.courses[(subject, number)] = term
        return p.key

    def match(self, raw: str, subject: str, number: str, term: str = "") -> tuple[str | None, str]:
        """Return (instructor_key or None, method). Logs ambiguous / unmatched names."""
        p = parse_name(raw)
        if p is None:
            return None, "blank"
        if (subject, raw) in self.overrides:
            return self.overrides[(subject, raw)], "override"
        cands = [c for c in self.by_subject.get(subject, {}).values() if compatible(p, c.parts)]
        method = "subject"
        if not cands:
            # Cross-listed courses are often recorded under one subject only; accept a unique global match.
            pool = {id(c): c for _s, c in self.global_by_last.get(p.last[:GPA_LAST_TRUNC - 2], [])
                    if compatible(p, c.parts)}
            uniq = {c.parts.key: c for c in pool.values()}
            if len(uniq) == 1:
                return next(iter(uniq)), "global-unique"
            self._log(raw, subject, number, term, "no candidate" if not uniq else f"{len(uniq)} global candidates")
            return None, "unmatched"
        if len({c.parts.key for c in cands}) == 1:
            return cands[0].parts.key, method
        # Tie-break: whoever taught this exact course most recently.
        taught = [(term_order(c.courses[(subject, number)]), c) for c in cands if (subject, number) in c.courses]
        if taught:
            taught.sort(key=lambda t: t[0], reverse=True)
            if len(taught) == 1 or taught[0][0] > taught[1][0]:
                return taught[0][1].parts.key, "recent-course"
        self._log(raw, subject, number, term, "ambiguous: " + "; ".join(sorted(c.raw for c in cands)))
        return None, "ambiguous"

    def _log(self, raw: str, subject: str, number: str, term: str, reason: str) -> None:
        self.unmatched.append({"source": "course-explorer", "raw_name": raw, "subject": subject,
                               "number": number, "term": term, "reason": reason})

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


def term_order(term: str) -> int:
    """'2026-fa' -> sortable int. Accepts '' (-> 0)."""
    if not term:
        return 0
    year, code = term.split("-")
    return int(year) * 10 + {"wi": 0, "sp": 1, "su": 2, "fa": 3}[code]


def load_overrides(path: Path) -> dict[tuple[str, str], str]:
    """data/name_overrides.csv: subject,raw_name,instructor_key."""
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as fh:
        return {(r["subject"], r["raw_name"]): r["instructor_key"] for r in csv.DictReader(fh)
                if not r["subject"].startswith("#")}
