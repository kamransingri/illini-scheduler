"""Phase 5: what exams and grading look like with each instructor.

Deterministic keyword rules only. A field the rules can't support stays "unknown" - we never guess. Every
non-unknown value carries evidence: (source, quote <= 120 chars). Sources, in order of specificity:
student notes (data/notes/*.yaml), RMP review snippets + tags, Course Explorer section text/notes, and the
course description / section information (course-level, applies to every instructor).
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass

from . import notes as notes_mod

FIELDS = ["n_midterms", "has_final", "exam_mode", "curve", "attendance_required", "homework_platform",
          "group_projects", "textbook_required"]
QUOTE_LEN = 120

NUM = {"no": 0, "zero": 0, "one": 1, "a": 1, "a single": 1, "two": 2, "three": 3, "four": 4, "five": 5,
       "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5}
_NUMRE = r"(no|zero|one|a single|two|three|four|five|[0-5])"

# (field, value, pattern). Negative patterns are listed before positive ones for the same field; once a field
# matches in a sentence, later patterns for that field are skipped.
RULES: list[tuple[str, object, re.Pattern[str]]] = [
    ("n_midterms", "count", re.compile(rf"\b{_NUMRE}\s+(?:in-class\s+|hourly\s+)?(?:midterms?|midterm exams?)\b")),
    ("n_midterms", 1, re.compile(r"\b(?:a|the|one)\s+mid-?term(?: exam)?\b(?!s)")),

    ("has_final", "optional", re.compile(r"\bfinal(?: exam)? (?:is|was) optional\b|\boptional final\b")),
    ("has_final", "no", re.compile(r"\bno final\b|\bno final exam\b|\bthere (?:is|was) no final\b|"
                                   r"\bdoesn'?t have a final\b|\bdoes not have a final\b|\binstead of a final\b|"
                                   r"\bfinal project instead\b")),
    ("has_final", "yes", re.compile(r"\b(?:cumulative |comprehensive |the |a )?final exam\b|"
                                    r"\bmidterms? and (?:a |the )?final\b|\bfinal is (?:cumulative|worth)\b")),

    ("exam_mode", "CBTF", re.compile(r"\bcbtf\b|\bcomputer[- ]based testing facility\b|"
                                     r"\bexams? (?:are|were|is|was) (?:in|at) the (?:cbtf|testing center)\b")),
    ("exam_mode", "take-home", re.compile(r"\btake[- ]home (?:exams?|midterms?|finals?|tests?)\b")),
    ("exam_mode", "online", re.compile(r"\bonline (?:exams?|midterms?|tests?|finals?)\b|"
                                       r"\bexams? (?:are|were) (?:taken )?online\b|\bproctorio\b|\bproctoru\b")),
    ("exam_mode", "in-person", re.compile(r"\bin[- ]person (?:exams?|midterms?|finals?)\b|\bpaper exams?\b|"
                                          r"\bexams? (?:are|were) (?:in[- ]person|on paper|in class)\b")),

    ("curve", "no", re.compile(r"\b(?:not|never|isn'?t|wasn'?t|aren'?t) curved\b|\bno curve\b|"
                               r"\b(?:doesn'?t|does not|didn'?t|did not|won'?t|will not) curve\b")),
    ("curve", "yes", re.compile(
        r"\b(?:grades?|exams?|class|course|midterms?|finals?) (?:is|are|was|were|gets?) curved\b|"
        r"\bcurved? (?:the )?(?:grades?|exams?|class|course)\b|\b(?:generous|big|nice|huge) curve\b|"
        r"\bthere (?:is|was) a curve\b|\bcurves? (?:up|at the end)\b")),

    ("attendance_required", "no", re.compile(r"\battendance (?:is |was )?(?:not|never) (?:mandatory|required|taken)\b|"
                                             r"\b(?:no|optional) attendance\b|\battendance (?:is |was )?optional\b|"
                                             r"\b(?:doesn'?t|does not|didn'?t|did not) take attendance\b")),
    ("attendance_required", "yes", re.compile(r"\battendance (?:is |was )?(?:mandatory|required|taken|graded)\b|"
                                              r"\b(?:takes|took|mandatory) attendance\b|\biclickers?\b|"
                                              r"\battendance (?:counts|matters)\b")),

    ("homework_platform", "PrairieLearn", re.compile(r"\bprairie ?learn\b|\bprairielearn\b")),
    ("homework_platform", "WebAssign", re.compile(r"\bwebassign\b")),
    ("homework_platform", "WeBWorK", re.compile(r"\bwebwork\b")),
    ("homework_platform", "Gradescope", re.compile(r"\bgradescope\b")),
    ("homework_platform", "Canvas", re.compile(r"\bcanvas\b")),
    ("homework_platform", "ALEKS", re.compile(r"\baleks\b")),
    ("homework_platform", "Mastering", re.compile(r"\bmastering(?:physics|chemistry|biology| physics| chemistry)\b")),

    ("group_projects", "no", re.compile(r"\bno group (?:projects?|work)\b|\bindividual projects? only\b|"
                                        r"\bprojects? (?:are|is) individual\b")),
    ("group_projects", "yes", re.compile(r"\bgroup projects?\b|\bteam projects?\b|\bsmall-group projects?\b|"
                                         r"\bgroups? of \w+ (?:students )?(?:for|on) (?:a|the) project\b")),

    ("textbook_required", "no", re.compile(r"\bno (?:required )?text ?books?\b|\btext ?book (?:is |was )?(?:not "
                                           r"(?:required|needed|necessary)|optional)\b|\b(?:don'?t|didn'?t|never) "
                                           r"(?:need|use|used|needed) the text ?book\b|"
                                           r"\bthere is no required text ?book\b")),
    ("textbook_required", "yes", re.compile(r"\btext ?book (?:is |was )?(?:required|needed|necessary|mandatory)\b|"
                                            r"\brequired text ?book\b|\bneed the text ?book\b")),
]


@dataclass
class Evidence:
    source: str
    quote: str


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;])\s+|\n+", text or "")
    return [p.strip() for p in parts if p.strip()]


def _quote(sentence: str, m: re.Match[str]) -> str:
    if len(sentence) <= QUOTE_LEN:
        return sentence
    start = max(0, m.start() - 40)
    q = sentence[start:start + QUOTE_LEN]
    return ("…" if start else "") + q.strip() + "…"


def extract(text: str, source: str) -> dict[str, list[tuple[object, Evidence]]]:
    """All field values supported by `text`, each with its evidence quote."""
    out: dict[str, list[tuple[object, Evidence]]] = defaultdict(list)
    for s in sentences(text):
        low = s.lower()
        done: set[str] = set()
        for field, value, pat in RULES:
            if field in done and field != "homework_platform":
                continue
            m = pat.search(low)
            if not m:
                continue
            if field == "homework_platform" and re.search(r"placement|score|prerequisite", low):
                continue  # "an adequate ALEKS score" is a placement test, not the homework platform
            if value == "count":
                value = NUM.get(m.group(1), None)
                if value is None:
                    continue
            out[field].append((value, Evidence(source, _quote(s, m))))
            done.add(field)
    return out


def merge(found: list[dict[str, list[tuple[object, Evidence]]]]) -> dict[str, dict]:
    """Majority vote per field; agreement = sources agreeing / sources mentioning the field."""
    profile: dict[str, dict] = {}
    for field in FIELDS:
        votes: list[tuple[object, Evidence]] = [v for f in found for v in f.get(field, [])]
        if not votes:
            profile[field] = {"value": "unknown", "agree": 0, "total": 0, "evidence": []}
            continue
        if field == "homework_platform":
            vals = sorted({str(v) for v, _ in votes})
            profile[field] = {"value": vals, "agree": len(votes), "total": len(votes),
                              "evidence": [e.__dict__ for _, e in votes[:4]]}
            continue
        counts = Counter(json.dumps(v) for v, _ in votes)
        best, n = counts.most_common(1)[0]
        value = json.loads(best)
        profile[field] = {"value": value, "agree": n, "total": len(votes),
                          "evidence": [e.__dict__ for v, e in votes if json.dumps(v) == best][:4]}
    return profile


def run(conn: sqlite3.Connection) -> str:
    conn.execute("DELETE FROM exam_format")
    from .fetch import CURRENT_TERM, NEXT_TERM

    # course-level text (latest record per course)
    course_text: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
    for r in conn.execute(
        "SELECT subject, number, description, section_info_text, schedule_info_text FROM courses "
        "WHERE term IN (?, ?) ORDER BY term", (CURRENT_TERM, NEXT_TERM)):
        course_text[(r[0], r[1])] = [("Course description", r[2] or ""),
                                     ("Course Explorer section info", " ".join(filter(None, r[3:5])))]
    # instructor-level sources
    inst_text: dict[tuple[str, str, str], list[tuple[str, str]]] = defaultdict(list)
    alias = {(r[0], r[1]): r[2] for r in conn.execute(
        "SELECT raw_name, subject, instructor_key FROM instructor_aliases")}
    teaching: dict[tuple[str, str], set[str]] = defaultdict(set)
    for r in conn.execute(
        "SELECT subject, number, instructors_raw, section_text, section_notes FROM sections WHERE term IN (?, ?)",
        (CURRENT_TERM, NEXT_TERM)):
        keys = [alias.get((raw.strip(), r[0])) for raw in (r[2] or "").split(";") if raw.strip()]
        for k in filter(None, keys):
            teaching[(r[0], r[1])].add(k)
            txt = " ".join(filter(None, (r[3], r[4])))
            if txt and ("Course Explorer section text", txt) not in inst_text[(k, r[0], r[1])]:
                inst_text[(k, r[0], r[1])].append(("Course Explorer section text", txt))
    for r in conn.execute("SELECT i.instructor_key, r.reviews_json, r.top_tags FROM instructors i "
                          "JOIN rmp r ON r.rmp_id = i.rmp_id"):
        for rev in json.loads(r[1] or "[]"):
            subj_num = re.match(r"([A-Z]+)\s?(\d{3})", rev.get("course", ""))
            if subj_num:
                inst_text[(r[0], subj_num.group(1), subj_num.group(2))].append(("RMP review", rev["text"]))
        for tag in json.loads(r[2] or "[]"):
            for (k, s, n) in [key for key in teaching_keys(teaching, r[0])]:
                inst_text[(k, s, n)].append(("RMP tag", tag))
    for note in notes_mod.load_all():
        key = alias.get((note.instructor, note.subject)) or note.fallback_key
        inst_text[(key, note.subject, note.number)].append(
            (f"Student note ({note.term})" if note.term else "Student note", note.text))

    n_rows = n_known = 0
    pairs = {(k, s, n) for (s, n), ks in teaching.items() for k in ks} | set(inst_text)
    for (s, n) in course_text:
        pairs.add(("*", s, n))
    for (k, s, n) in pairs:
        found = [extract(t, src) for src, t in inst_text.get((k, s, n), [])]
        found += [extract(t, src) for src, t in course_text.get((s, n), [])]
        prof = merge(found)
        known = sum(1 for f in FIELDS if prof[f]["value"] != "unknown")
        if known == 0:
            continue
        n_known += known > 0
        conn.execute("INSERT OR REPLACE INTO exam_format VALUES (?,?,?,?)", (k, s, n, json.dumps(prof)))
        n_rows += 1
    return f"{n_rows} profiles, {n_known} with at least one known field"


def teaching_keys(teaching: dict[tuple[str, str], set[str]], key: str) -> list[tuple[str, str, str]]:
    return [(key, s, n) for (s, n), ks in teaching.items() if key in ks]
