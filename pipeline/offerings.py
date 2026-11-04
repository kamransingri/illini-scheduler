"""Phase 4: "when is it offered" and "what changed".

* offerings(subject, number, term, n_sections, instructors, online_share) for every loaded term.
* offering_pattern: a plain-English label ("Every fall and spring", "Spring, odd years", "Irregular") and a
  High / Medium / Low prediction, with the reason, for the first term whose schedule isn't published yet.
* course_changes: field-level changes between consecutive offerings of a course (title, credit hours,
  description, prerequisites, gen-ed codes, delivery mode, new instructors), each with a one-line summary.
"""

from __future__ import annotations

import difflib
import re
import sqlite3
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from .course_explorer import term_label
from .names import parse_name, term_order

ONLINE_TYPES = {"ONL", "OLC", "OLD", "OD", "OLB"}
COURSE_CODE = re.compile(r"\b([A-Z]{2,4})\s?(\d{3})\b")


# ---------------------------------------------------------------------------------------------------------
# Offering pattern
# ---------------------------------------------------------------------------------------------------------

def season(term: str) -> str:
    return term.split("-")[1]


def year(term: str) -> int:
    return int(term.split("-")[0])


def next_regular_term(term: str) -> str:
    y, s = year(term), season(term)
    return f"{y}-fa" if s in ("sp", "su") else f"{y + 1}-sp"


def regular_window(last_published: str, n: int = 8) -> list[str]:
    """The n regular (fall/spring) terms ending at last_published, oldest first."""
    out = [last_published]
    while len(out) < n:
        y, s = year(out[0]), season(out[0])
        out.insert(0, f"{y}-sp" if s == "fa" else f"{y - 1}-fa")
    return out


@dataclass
class Pattern:
    label: str
    likelihood: str
    reason: str


def label_pattern(offered: Iterable[str], window: Sequence[str], summers: Sequence[str] = ()) -> str:
    """Label the offering history over `window` (regular terms, oldest first)."""
    off = set(offered)
    falls = [t for t in window if season(t) == "fa"]
    springs = [t for t in window if season(t) == "sp"]
    of = [t for t in falls if t in off]
    os_ = [t for t in springs if t in off]
    n = len(of) + len(os_)
    summer_n = sum(1 for t in summers if t in off)
    suffix = ", plus summers" if summers and summer_n >= max(2, len(summers) - 1) else ""
    if n == 0:
        return "Summer only" if any(season(t) == "su" for t in off) else "Not offered recently"
    if len(of) == len(falls) and len(os_) == len(springs):
        return "Every fall and spring" + suffix
    if len(of) == len(falls) and not os_:
        return "Fall only" + suffix
    if len(os_) == len(springs) and not of:
        return "Spring only" + suffix
    for name, sel, offd in (("Fall", falls, of), ("Spring", springs, os_)):
        other = os_ if name == "Fall" else of
        if other or len(offd) < 2:
            continue
        parities = {year(t) % 2 for t in offd}
        if len(parities) == 1:
            p = parities.pop()
            expected = [t for t in sel if year(t) % 2 == p]
            if set(expected) == set(offd):
                return f"{name}, {'odd' if p else 'even'} years" + suffix
    if n >= len(window) - 1:
        return "Almost every fall and spring" + suffix
    return f"Irregular ({n} of the last {len(window)} fall/spring terms)" + suffix


def predict(offered: Iterable[str], window: Sequence[str], target: str) -> tuple[str, str]:
    """High / Medium / Low that the course runs in `target`, with a reason a student can read."""
    off = set(offered)
    s, y = season(target), year(target)
    same = [t for t in window if season(t) == s]
    hit = [t for t in same if t in off]
    sname = {"fa": "fall", "sp": "spring"}[s]
    tl = term_label(target)
    label = label_pattern(off, window)
    if "odd years" in label or "even years" in label:
        parity_ok = (y % 2 == 1) == ("odd years" in label)
        return ("High", f"Runs in {label.split(',')[1].strip()} only, and {tl} fits that pattern") if parity_ok \
            else ("Low", f"Runs in {label.split(',')[1].strip()} only, and {tl} breaks that pattern")
    if not same:
        return "Low", "No history for this season"
    since = term_label(same[0])
    if len(hit) == len(same):
        return "High", f"Offered every {sname} since {since}"
    recent = [t for t in window[-4:] if t in off]
    if len(hit) >= len(same) / 2 and recent:
        return "Medium", f"Offered in {len(hit)} of the last {len(same)} {sname} terms"
    if hit:
        return "Low", f"Offered in only {len(hit)} of the last {len(same)} {sname} terms (last: {term_label(hit[-1])})"
    return "Low", f"Not offered in any {sname} term since {since}"


# ---------------------------------------------------------------------------------------------------------
# Change detection
# ---------------------------------------------------------------------------------------------------------

def norm(text: str) -> str:
    """Lower-case, drop punctuation and collapse whitespace so cosmetic edits don't count."""
    return " ".join(re.sub(r"[^\w\s]", " ", (text or "").lower()).split())


def _words(text: str) -> list[str]:
    return re.findall(r"[\w'’-]+", text or "")


def word_diff(old: str, new: str, max_words: int = 12) -> tuple[list[str], list[str]]:
    """Added / removed word runs between two texts (compared on normalised words)."""
    a, b = _words(old), _words(new)
    an, bn = [w.lower() for w in a], [w.lower() for w in b]
    sm = difflib.SequenceMatcher(a=an, b=bn, autojunk=False)
    added, removed = [], []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op in ("replace", "insert") and any(bn[j1:j2]):
            added.append(" ".join(b[j1:j2][:max_words]) + ("…" if j2 - j1 > max_words else ""))
        if op in ("replace", "delete") and any(an[i1:i2]):
            removed.append(" ".join(a[i1:i2][:max_words]) + ("…" if i2 - i1 > max_words else ""))
    return added, removed


def codes(text: str) -> list[str]:
    return sorted({f"{s} {n}" for s, n in COURSE_CODE.findall(text or "")})


def summarize(field: str, old: str, new: str) -> str:
    if field == "title":
        return f"Renamed: “{old}” → “{new}”"
    if field == "credit_hours":
        return f"Credit hours changed: {old.replace(' hours.', '')} → {new.replace(' hours.', '')}"
    if field == "gened_codes":
        o, n = set(old.split()), set(new.split())
        parts = []
        if n - o:
            parts.append("added " + ", ".join(sorted(n - o)))
        if o - n:
            parts.append("removed " + ", ".join(sorted(o - n)))
        return "Gen-ed " + "; ".join(parts)
    if field == "delivery":
        return f"Delivery changed: {old} → {new}"
    if field == "instructor":
        return f"New instructor: {new}"
    if field == "prereq_text":
        if not old:
            return f"Prerequisite added: {new[:120]}"
        if not new:
            return "Prerequisite removed"
        oc, nc = set(codes(old)), set(codes(new))
        parts = []
        if nc - oc:
            parts.append("now lists " + ", ".join(sorted(nc - oc)))
        if oc - nc:
            parts.append("no longer lists " + ", ".join(sorted(oc - nc)))
        if parts:
            return "Prerequisite changed: " + "; ".join(parts)
        added, removed = word_diff(old, new, 8)
        return "Prerequisite wording changed" + (f": now says “{added[0]}”" if added else "")
    if field == "description":
        added, removed = word_diff(old, new)
        n_add = sum(len(a.split()) for a in added)
        n_rem = sum(len(r.split()) for r in removed)
        bits = []
        if added:
            bits.append(f"added “{added[0]}”")
        if removed:
            bits.append(f"removed “{removed[0]}”")
        return f"Description updated (+{n_add}/−{n_rem} words): " + "; ".join(bits)
    return f"{field} changed"


def delivery(online_share: float) -> str:
    if online_share >= 0.9:
        return "online"
    if online_share <= 0.1:
        return "in-person"
    return "hybrid"


def diff_records(old: dict, new: dict) -> list[tuple[str, str, str]]:
    """Meaningful field changes between two course records -> [(field, old, new)]."""
    out = []
    for f in ("title", "credit_hours", "description", "prereq_text"):
        if norm(old.get(f, "")) != norm(new.get(f, "")):
            out.append((f, old.get(f, ""), new.get(f, "")))
    if set(old.get("gened_codes", "").split()) != set(new.get("gened_codes", "").split()):
        out.append(("gened_codes", old.get("gened_codes", ""), new.get("gened_codes", "")))
    if "online_share" in old and "online_share" in new:
        do, dn = delivery(old["online_share"]), delivery(new["online_share"])
        if do != dn and abs(old["online_share"] - new["online_share"]) >= 0.3:
            out.append(("delivery", do, dn))
    return out


# ---------------------------------------------------------------------------------------------------------
# Pipeline stage
# ---------------------------------------------------------------------------------------------------------

def run(conn: sqlite3.Connection, next_term: str) -> str:
    conn.execute("DELETE FROM offerings")
    conn.execute("DELETE FROM offering_pattern")
    conn.execute("DELETE FROM course_changes")
    terms = sorted((r[0] for r in conn.execute("SELECT term FROM terms")), key=term_order)
    # offerings
    sec_rows = conn.execute(
        "SELECT term, subject, number, type, component, instructors_raw FROM sections WHERE status_code != 'P'"
    ).fetchall()
    agg: dict[tuple[str, str, str], dict] = defaultdict(lambda: {"n": 0, "online": 0, "primary": 0, "inst": []})
    for r in sec_rows:
        a = agg[(r["subject"], r["number"], r["term"])]
        a["n"] += 1
        if r["component"] == "primary":
            a["primary"] += 1
            if r["type"] in ONLINE_TYPES:
                a["online"] += 1
            for raw in (r["instructors_raw"] or "").split(";"):
                raw = raw.strip()
                if raw and raw not in a["inst"]:
                    a["inst"].append(raw)
    for (subj, num, term), a in agg.items():
        share = a["online"] / a["primary"] if a["primary"] else 0.0
        conn.execute("INSERT INTO offerings VALUES (?,?,?,?,?,?)",
                     (subj, num, term, a["n"], "; ".join(a["inst"]), share))

    by_course: dict[tuple[str, str], set[str]] = defaultdict(set)
    for (subj, num, term) in agg:
        by_course[(subj, num)].add(term)
    published_regular = [t for t in terms if season(t) in ("fa", "sp")]
    last_pub = published_regular[-1] if published_regular else next_term
    window = [t for t in regular_window(last_pub) if t in terms] or published_regular
    summers = [t for t in terms if season(t) == "su"][-3:]
    target = next_regular_term(last_pub)
    for (subj, num), offered in by_course.items():
        lab = label_pattern(offered, window, summers)
        like, why = predict(offered, window, target)
        conn.execute("INSERT INTO offering_pattern VALUES (?,?,?,?,?,?)", (subj, num, lab, target, like, why))

    # changes between consecutive offerings
    course_rows: dict[tuple[str, str], dict[str, dict]] = defaultdict(dict)
    for r in conn.execute("SELECT * FROM courses"):
        rec = dict(r)
        ag = agg.get((r["subject"], r["number"], r["term"]))
        if ag and ag["primary"]:
            rec["online_share"] = ag["online"] / ag["primary"]
        course_rows[(r["subject"], r["number"])][r["term"]] = rec
    n_changes = 0
    for (subj, num), recs in course_rows.items():
        # Compare consecutive regular (fall/spring) offerings; summer listings are often a different format.
        ts = sorted((t for t in recs if season(t) in ("fa", "sp")), key=term_order) or sorted(recs, key=term_order)
        for prev, t in zip(ts, ts[1:], strict=False):
            for field, old, new in diff_records(recs[prev], recs[t]):
                conn.execute("INSERT INTO course_changes VALUES (?,?,?,?,?,?,?)",
                             (subj, num, t, field, old, new, summarize(field, old, new)))
                n_changes += 1
        # New instructors: primary-section instructors in the latest offering who taught none of the earlier ones.
        if len(ts) >= 2:
            latest = ts[-1]
            earlier = {_ikey(x) for t in ts[:-1] for x in (agg.get((subj, num, t), {}).get("inst") or [])}
            raws = agg.get((subj, num, latest), {}).get("inst") or []
            new_keys = sorted({_ikey(x) for x in raws} - earlier - {""})
            names = [_display(raws, k) for k in new_keys]
            if 0 < len(names) <= 3:
                for nm in names:
                    conn.execute("INSERT INTO course_changes VALUES (?,?,?,?,?,?,?)",
                                 (subj, num, latest, "instructor", "", nm,
                                  f"New instructor: {nm} (no record of teaching it "
                                  f"{term_label(ts[0])} to {term_label(ts[-2])})"))
                    n_changes += 1
            elif len(names) > 3:
                conn.execute("INSERT INTO course_changes VALUES (?,?,?,?,?,?,?)",
                             (subj, num, latest, "instructor", "", "; ".join(names),
                              f"{len(names)} new instructors this term, e.g. {', '.join(names[:3])}"))
                n_changes += 1
    return (f"{len(agg)} course-terms, {len(by_course)} courses with patterns (predicting {target}), "
            f"{n_changes} changes")


def _ikey(raw: str) -> str:
    p = parse_name(raw)
    return p.key if p else ""


def _display(raws: list[str], key: str) -> str:
    for r in raws:
        p = parse_name(r)
        if p and p.key == key:
            return p.display
    return key
