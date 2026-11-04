"""Phase 2: course- and instructor-level GPA from Wade Fagen-Ulmschneider's GPA dataset.

GPA per row = weighted mean using UIUC points (A+ 4.0, A 4.0, A- 3.67, B+ 3.33, B 3.0, B- 2.67, C+ 2.33,
C 2.0, C- 1.67, D+ 1.33, D 1.0, D- 0.67, F 0). W is excluded from GPA but its rate is kept.
"""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from .names import InstructorMatcher, parse_name, term_order
from .textio import open_mixed

POINTS: dict[str, float] = {
    "A+": 4.0, "A": 4.0, "A-": 3.67, "B+": 3.33, "B": 3.0, "B-": 2.67, "C+": 2.33, "C": 2.0, "C-": 1.67,
    "D+": 1.33, "D": 1.0, "D-": 0.67, "F": 0.0,
}
LETTERS = list(POINTS)
BUCKETS = {"A": ["A+", "A", "A-"], "B": ["B+", "B", "B-"], "C": ["C+", "C", "C-"], "DF": ["D+", "D", "D-", "F"]}
WINDOW_START = "2015-fa"     # avg_gpa covers this term onward (DECISIONS.md D2.2)
RECENT_TERMS = 8             # recent_avg_gpa = last 8 regular (fall/spring) terms in the dataset
LOW_SAMPLE = 60              # instructors with fewer students get a "limited data" flag


def row_gpa(counts: Mapping[str, float]) -> float | None:
    """Weighted GPA for one row of letter counts (W ignored). None when there are no graded students."""
    graded = sum(counts.get(k, 0) for k in LETTERS)
    if graded == 0:
        return None
    return sum(POINTS[k] * counts.get(k, 0) for k in LETTERS) / graded


@dataclass
class Agg:
    """Running letter-grade counts."""

    counts: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    terms: set[str] = field(default_factory=set)

    def add(self, counts: Mapping[str, float], term: str) -> None:
        for k in LETTERS + ["W"]:
            self.counts[k] += counts.get(k, 0)
        self.terms.add(term)

    @property
    def graded(self) -> float:
        return sum(self.counts[k] for k in LETTERS)

    @property
    def gpa(self) -> float | None:
        return row_gpa(self.counts)

    def pct(self) -> dict[str, float]:
        g = self.graded
        out = {b: (sum(self.counts[k] for k in ks) / g if g else 0.0) for b, ks in BUCKETS.items()}
        total = g + self.counts["W"]
        out["W"] = self.counts["W"] / total if total else 0.0
        return out

    @property
    def first_term(self) -> str:
        return min(self.terms, key=term_order) if self.terms else ""

    @property
    def last_term(self) -> str:
        return max(self.terms, key=term_order) if self.terms else ""


def load_gpa_csv(path: Path | str) -> pd.DataFrame:
    df = pd.read_csv(open_mixed(path), dtype=str, keep_default_na=False)
    for k in LETTERS + ["W", "Students"]:
        df[k] = pd.to_numeric(df[k], errors="coerce").fillna(0).astype(int)
    df["Subject"] = df["Subject"].str.strip()
    df["Number"] = df["Number"].str.strip()
    return df


def recent_terms(all_terms: Iterable[str], n: int = RECENT_TERMS) -> list[str]:
    regular = sorted({t for t in all_terms if t.endswith(("-sp", "-fa"))}, key=term_order)
    return regular[-n:]


@dataclass
class GpaResult:
    course: dict[tuple[str, str], dict]
    course_term: list[dict]
    instructor_course: list[dict]
    recent: list[str]
    window: tuple[str, str]


def compute(df: pd.DataFrame, window_start: str = WINDOW_START) -> GpaResult:
    df = df[df["YearTerm"].map(term_order) >= term_order(window_start)]
    recent = set(recent_terms(df["YearTerm"].unique()))
    course_all: dict[tuple[str, str], Agg] = defaultdict(Agg)
    course_recent: dict[tuple[str, str], Agg] = defaultdict(Agg)
    course_term: dict[tuple[str, str, str], Agg] = defaultdict(Agg)
    titles: dict[tuple[str, str], tuple[int, str]] = {}
    inst: dict[tuple[str, str, str], Agg] = defaultdict(Agg)
    inst_recent: dict[tuple[str, str, str], Agg] = defaultdict(Agg)
    inst_term: dict[tuple[str, str, str], dict[str, Agg]] = defaultdict(lambda: defaultdict(Agg))
    inst_names: dict[str, tuple[int, str]] = {}

    for d in df.to_dict("records"):
        counts = {k: d[k] for k in LETTERS + ["W"]}
        term, subj, num = d["YearTerm"], d["Subject"], d["Number"]
        ck = (subj, num)
        course_all[ck].add(counts, term)
        course_term[(subj, num, term)].add(counts, term)
        if term in recent:
            course_recent[ck].add(counts, term)
        if ck not in titles or term_order(term) >= titles[ck][0]:
            titles[ck] = (term_order(term), d["Course Title"])
        p = parse_name(d["Primary Instructor"])
        if p is not None:
            ik = (subj, num, p.key)
            inst[ik].add(counts, term)
            inst_term[ik][term].add(counts, term)
            if term in recent:
                inst_recent[ik].add(counts, term)
            if p.key not in inst_names or term_order(term) >= inst_names[p.key][0]:
                inst_names[p.key] = (term_order(term), d["Primary Instructor"])

    courses: dict[tuple[str, str], dict] = {}
    for ck, agg in course_all.items():
        if agg.gpa is None:
            continue
        r = course_recent.get(ck)
        pct = agg.pct()
        courses[ck] = {
            "subject": ck[0], "number": ck[1], "title": titles[ck][1], "avg_gpa": agg.gpa,
            "recent_avg_gpa": r.gpa if r else None, "students": int(agg.graded + agg.counts["W"]),
            "recent_students": int(r.graded + r.counts["W"]) if r else 0, "terms_covered": len(agg.terms),
            "first_term": agg.first_term, "last_term": agg.last_term,
            "pct_A": pct["A"], "pct_B": pct["B"], "pct_C": pct["C"], "pct_DF": pct["DF"], "pct_W": pct["W"],
        }
    cterms = []
    for (subj, num, term), agg in course_term.items():
        if agg.gpa is None:
            continue
        pct = agg.pct()
        cterms.append({"subject": subj, "number": num, "term": term, "avg_gpa": agg.gpa,
                       "students": int(agg.graded + agg.counts["W"]), "pct_A": pct["A"], "pct_B": pct["B"],
                       "pct_C": pct["C"], "pct_DF": pct["DF"], "pct_W": pct["W"]})
    instructors = []
    for ik, agg in inst.items():
        subj, num, key = ik
        if agg.gpa is None:
            continue
        # delta = instructor GPA minus the course GPA *in the same terms*, weighted by the instructor's students,
        # so grade inflation across years doesn't masquerade as an easy or hard instructor (D2.3).
        num_, den = 0.0, 0.0
        for term, a in inst_term[ik].items():
            cg = course_term[(subj, num, term)].gpa
            if a.gpa is not None and cg is not None:
                num_ += (a.gpa - cg) * a.graded
                den += a.graded
        r = inst_recent.get(ik)
        pct = agg.pct()
        students = int(agg.graded + agg.counts["W"])
        instructors.append({
            "subject": subj, "number": num, "instructor_key": key, "instructor_name": inst_names[key][1],
            "avg_gpa": agg.gpa, "recent_avg_gpa": r.gpa if r else None, "students": students,
            "n_terms": len(agg.terms), "first_term": agg.first_term, "last_term": agg.last_term,
            "delta_vs_course": num_ / den if den else 0.0, "limited_data": int(students < LOW_SAMPLE),
            "pct_A": pct["A"], "pct_B": pct["B"], "pct_C": pct["C"], "pct_DF": pct["DF"], "pct_W": pct["W"],
        })
    all_terms = sorted(df["YearTerm"].unique(), key=term_order)
    return GpaResult(courses, cterms, instructors, sorted(recent, key=term_order), (all_terms[0], all_terms[-1]))


def build_matcher(df: pd.DataFrame, overrides: dict[tuple[str, str], str] | None = None) -> InstructorMatcher:
    m = InstructorMatcher(overrides)
    for subj, num, term, name in df[["Subject", "Number", "YearTerm", "Primary Instructor"]].itertuples(index=False):
        m.add(name, subj, num, term)
    return m


def store(conn: sqlite3.Connection, res: GpaResult) -> None:
    conn.execute("DELETE FROM gpa_course")
    conn.execute("DELETE FROM gpa_course_term")
    conn.execute("DELETE FROM gpa_instructor_course")
    cols = ["subject", "number", "title", "avg_gpa", "recent_avg_gpa", "students", "recent_students",
            "terms_covered", "first_term", "last_term", "pct_A", "pct_B", "pct_C", "pct_DF", "pct_W"]
    conn.executemany(f"INSERT INTO gpa_course ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                     [[c[k] for k in cols] for c in res.course.values()])
    cols = ["subject", "number", "term", "avg_gpa", "students", "pct_A", "pct_B", "pct_C", "pct_DF", "pct_W"]
    conn.executemany(f"INSERT INTO gpa_course_term ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                     [[c[k] for k in cols] for c in res.course_term])
    cols = ["subject", "number", "instructor_key", "instructor_name", "avg_gpa", "recent_avg_gpa", "students",
            "n_terms", "first_term", "last_term", "delta_vs_course", "limited_data",
            "pct_A", "pct_B", "pct_C", "pct_DF", "pct_W"]
    conn.executemany(
        f"INSERT OR REPLACE INTO gpa_instructor_course ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
        [[c[k] for k in cols] for c in res.instructor_course])


# ---- gen-eds ----------------------------------------------------------------------------------------------

GENED_CATEGORIES = ["ACP", "CS", "HUM", "NAT", "QR", "SBS"]


def load_geneds(path: Path | str) -> list[dict]:
    df = pd.read_csv(open_mixed(path), dtype=str, keep_default_na=False)
    out = []
    for r in df.to_dict("records"):
        subj, _, num = r["Course"].strip().partition(" ")
        codes = [r[c].strip() for c in GENED_CATEGORIES if r.get(c, "").strip()]
        cats = [c for c in GENED_CATEGORIES if r.get(c, "").strip()]
        out.append({"subject": subj, "number": num.strip(), "term": r.get("TermYear") or r.get("YearTerm", ""),
                    "codes": " ".join(codes), "categories": " ".join(cats)})
    return out


def store_geneds(conn: sqlite3.Connection, rows: list[dict]) -> None:
    conn.execute("DELETE FROM geneds")
    conn.executemany("INSERT OR REPLACE INTO geneds VALUES (:subject, :number, :term, :codes, :categories)", rows)
