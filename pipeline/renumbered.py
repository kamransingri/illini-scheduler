"""Renumbered courses (#29): link an old course number to its new one so history carries over.

data/renumbered.csv holds one row per renumbering, checked by hand: old code, new code, the first term under the new
number and the source (a quote from Course Explorer or the catalog). Rows of the old code from *before* that term are
counted as the new course everywhere the pipeline aggregates by course: GPA (whole-course, per term and per
instructor), offering history and pattern, and the change timeline. The terms never overlap, so nothing is counted
twice. Rows of the old code from that term on stay under the old code (a number can be reused).

    python -m pipeline.renumbered            # check the file (and print the links)
    python -m pipeline.renumbered --suggest  # candidates from Course Explorer text in data/illini.db, to review

A suggestion is never added automatically: titles alone are not evidence (#29).
"""

from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import sys
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .config import DATA
from .names import term_order

RENUMBERED = DATA / "renumbered.csv"
CODE = r"([A-Z]{2,5}) ?(\d{3})"
TERM_RE = re.compile(r"^\d{4}-(sp|su|fa|wi)$")

Code = tuple[str, str]


@dataclass(frozen=True)
class Link:
    old: Code
    new: Code
    first_term: str  # first term under the new number
    source: str

    @property
    def old_code(self) -> str:
        return f"{self.old[0]} {self.old[1]}"

    @property
    def new_code(self) -> str:
        return f"{self.new[0]} {self.new[1]}"


def _code(text: str) -> Code:
    m = re.fullmatch(CODE, text.strip().upper())
    if not m:
        raise ValueError(f"not a course code: {text!r}")
    return m[1], m[2]


def load(path: Path = RENUMBERED) -> list[Link]:
    """Read and check the file. Raises ValueError on a bad row, an old code listed twice, or a chain/loop."""
    if not path.exists():
        return []
    rows = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip() and not line.startswith("#")]
    links: list[Link] = []
    for i, r in enumerate(csv.DictReader(rows), start=2):
        try:
            old, new, term = _code(r["old"]), _code(r["new"]), (r["first_term"] or "").strip()
        except (ValueError, AttributeError) as e:
            raise ValueError(f"{path.name} row {i}: {e}") from None
        if not TERM_RE.match(term):
            raise ValueError(f"{path.name} row {i}: first_term {term!r} isn't like 2026-fa")
        if old == new:
            raise ValueError(f"{path.name} row {i}: old and new are the same")
        if not (r.get("source") or "").strip():
            raise ValueError(f"{path.name} row {i}: every link needs a source")
        links.append(Link(old, new, term, r["source"].strip()))
    olds = [x.old for x in links]
    if len(set(olds)) != len(olds):
        raise ValueError(f"{path.name}: an old code is listed twice")
    news = [x.new for x in links]
    if len(set(news)) != len(news):
        raise ValueError(f"{path.name}: a new code has two old codes (a merge, not a renumbering)")
    if set(olds) & set(news):
        raise ValueError(f"{path.name}: a new code is also renumbered; link the oldest code straight to the newest")
    return links


class Renamer:
    """old code + term -> the code that term counts under."""

    def __init__(self, links: Iterable[Link]):
        self.links = list(links)
        self.by_old = {x.old: x for x in self.links}
        self.by_new: dict[Code, list[Link]] = defaultdict(list)
        for x in self.links:
            self.by_new[x.new].append(x)

    def __call__(self, subject: str, number: str, term: str) -> Code:
        x = self.by_old.get((subject, number))
        if x and term_order(term) < term_order(x.first_term):
            return x.new
        return subject, number

    def former(self, subject: str, number: str, term: str) -> str | None:
        """For a course that took over an old number: the code it had in `term`, if that was the old one."""
        for x in self.by_new.get((subject, number), []):
            if term_order(term) < term_order(x.first_term):
                return x.old_code
        return None

    def modernize(self, text: str, before: str, after: str) -> str:
        """An older catalog entry's `text` (from term `before`) in the numbers of term `after`: codes renumbered in
        between are written as their new codes, so the comparison doesn't report "now lists SPAN 203; no longer lists
        SPAN 141". Codes renumbered earlier are left alone: credit-exclusion sentences name the old code on purpose."""
        for x in self.links:
            if text and term_order(before) < term_order(x.first_term) <= term_order(after):
                text = re.sub(rf"\b{x.old[0]} ?{x.old[1]}\b", x.new_code, text)
        return text

    def __bool__(self) -> bool:
        return bool(self.links)


def apply_gpa(df: pd.DataFrame, rename: Renamer) -> pd.DataFrame:
    """The GPA dataset with the old code's rows before the change counted under the new code."""
    if not rename or df.empty:
        return df
    out = df.copy()
    for x in rename.links:
        m = ((out["Subject"] == x.old[0]) & (out["Number"].astype(str) == x.old[1])
             & (out["YearTerm"].map(term_order) < term_order(x.first_term)))
        out.loc[m, "Subject"] = x.new[0]
        out.loc[m, "Number"] = x.new[1]
    return out


# --- suggestions -------------------------------------------------------------------------------------------------

def _listed_terms(conn: sqlite3.Connection) -> dict[Code, list[str]]:
    terms: dict[Code, list[str]] = defaultdict(list)
    for t, s, n in conn.execute("SELECT term, subject, number FROM courses"):
        terms[(s, n)].append(t)
    return {k: sorted(v, key=term_order) for k, v in terms.items()}


def suggest(conn: sqlite3.Connection, known: Iterable[Link] = ()) -> list[dict]:
    """Candidate links with the sentence behind each, strongest evidence first.

    - "formerly OLD" in the new course's own text, or "NEW (formerly OLD)" anywhere;
    - "Credit is not given ... OLD and NEW" in the new course's text, where OLD stopped being listed before NEW started;
    - OLD and NEW given as alternatives ("OLD, NEW, or equivalent") in a prerequisite, with the same succession and the
      same title. Weakest: always read the source.
    """
    listed = _listed_terms(conn)
    titles = {(s, n): t for s, n, t in conn.execute(
        "SELECT subject, number, title FROM courses c WHERE term = (SELECT MAX(term) FROM courses d "
        "WHERE d.subject = c.subject AND d.number = c.number)")}
    skip = {(x.old, x.new) for x in known}
    found: dict[tuple[Code, Code], dict] = {}

    def succeeds(old: Code, new: Code) -> bool:
        a, b = listed.get(old), listed.get(new)
        return bool(a and b) and term_order(a[-1]) < term_order(b[0])  # type: ignore[index]

    def add(old: Code, new: Code, kind: str, rank: int, quote: str, where: str) -> None:
        if old == new or (old, new) in skip or new not in listed:
            return
        cur = found.get((old, new))
        if cur is None or rank < cur["rank"]:
            first = listed[new][0]
            found[(old, new)] = {"old": f"{old[0]} {old[1]}", "new": f"{new[0]} {new[1]}", "first_term": first,
                                 "kind": kind, "rank": rank, "source": f'{where}: "{quote.strip()}"',
                                 "old_last_listed": (listed.get(old) or ["before 2022-fa"])[-1]}

    rows = conn.execute("SELECT term, subject, number, description, prereq_text, section_info_text FROM courses "
                        "ORDER BY term DESC").fetchall()
    for term, s, n, *texts in rows:
        text = " ".join(t for t in texts if t)
        here = (s, n)
        where = f"Course Explorer {s} {n} ({term})"
        for sent in re.split(r"(?<=\.)\s+", text):
            for m in re.finditer(CODE + r" \(formerly (?:([A-Z]{2,5}) )?(\d{3})", sent):
                add((m[3] or m[1], m[4]), (m[1], m[2]), "formerly", 0, sent, where)
            m2 = re.search(r"\bFormerly " + CODE, sent)
            if m2:
                add((m2[1], m2[2]), here, "formerly", 0, sent, where)
            if "Credit is not given" in sent:
                for c in re.finditer(CODE, sent):
                    old = (c[1], c[2])
                    if old != here and succeeds(old, here):
                        add(old, here, "credit not given for both", 1, sent, where)
            if "Prerequisite" in sent:
                for p in re.finditer(CODE + r"(?:,| or) " + CODE, sent):
                    old, new = (p[1], p[2]), (p[3], p[4])
                    if succeeds(old, new) and titles.get(old) == titles.get(new):
                        add(old, new, "alternatives in a prerequisite, same title", 2, sent, where)
    return sorted(found.values(), key=lambda d: (d["rank"], d["new"]))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Check data/renumbered.csv, or suggest links to review")
    ap.add_argument("--suggest", action="store_true", help="list candidate links from Course Explorer text")
    ap.add_argument("--db", type=Path, default=DATA / "illini.db")
    args = ap.parse_args(argv)
    links = load()
    if not args.suggest:
        for x in links:
            print(f"{x.old_code} -> {x.new_code} from {x.first_term}")
        print(f"{len(links)} links, file OK")
        return 0
    conn = sqlite3.connect(args.db)
    for d in suggest(conn, links):
        print(f"{d['old']} -> {d['new']} from {d['first_term']} (old last listed {d['old_last_listed']}) "
              f"[{d['kind']}]\n    {d['source'][:220]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
