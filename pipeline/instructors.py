"""Phase 3: one instructor identity across Course Explorer, the GPA dataset, RMP and the TRE list."""

from __future__ import annotations

import json
import os
import sqlite3
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from .config import DATA
from .fetch import CURRENT_TERM, NEXT_TERM
from .gpa import build_matcher
from .names import InstructorMatcher, compatible, cross_listings, load_overrides, parse_name, term_order
from .rmp import RmpClient, RmpUnavailable

TRE_SINCE = "2020-fa"


def split_raw(raw: str) -> list[str]:
    return [p.strip() for p in (raw or "").split(";") if p.strip()]


def tre_term(t: str) -> str:
    """'fa2023' -> '2023-fa'."""
    return f"{t[2:]}-{t[:2]}"


UNLINKED = ("unmatched", "ambiguous", "blank")
Links = dict[tuple[str, str], dict[str, tuple[str | None, str]]]  # (raw, subject) -> number -> (key or None, method)


def match_course_explorer(conn: sqlite3.Connection, matcher: InstructorMatcher) -> tuple[list[sqlite3.Row], Links]:
    """Link every Course Explorer name of the current and next term to a GPA-dataset identity, using all the
    courses it teaches in that subject (next term's lectures first) and the catalog's cross-listings
    (InstructorMatcher.match_courses). Returns the section rows and the links."""
    rows = conn.execute(
        "SELECT DISTINCT term, subject, number, instructors_raw, component FROM sections WHERE term IN (?, ?)",
        (CURRENT_TERM, NEXT_TERM),
    ).fetchall()
    cross = cross_listings(conn.execute("SELECT subject, number, description FROM courses"))
    taught: dict[tuple[str, str], set[tuple[int, str, str]]] = defaultdict(set)
    for r in rows:
        rank = (r["term"] != NEXT_TERM) * 2 + (r["component"] != "primary")
        for raw in split_raw(r["instructors_raw"]):
            taught[(raw, r["subject"])].add((rank, r["number"], r["term"]))
    links: Links = {}
    for (raw, subject), ts in taught.items():
        best: dict[str, str] = {}
        for _rank, n, t in sorted(ts):
            best.setdefault(n, t)
        links[(raw, subject)] = matcher.match_courses(raw, subject, list(best.items()), cross)
    meets_with(conn, links, matcher)
    return rows, links


def meets_with(conn: sqlite3.Connection, links: Links, matcher: InstructorMatcher) -> int:
    """Course Explorer lists one class under several courses: CS 498 "Applied Large Language Models" and NPRE 498
    meet on the same days, at the same time, in the same room, with the same instructor name. A name left unlinked
    in one of them takes the identity it has in the others, when that's one person ("meets-with"). Returns how many
    courses were linked this way."""
    slots: dict[tuple, set[tuple[str, str]]] = defaultdict(set)
    for r in conn.execute(
            "SELECT term, subject, number, days, start_time, end_time, building, room, instructors_raw FROM sections "
            "WHERE term IN (?, ?) AND start_time IS NOT NULL AND COALESCE(building, '') <> '' "
            "AND COALESCE(room, '') <> ''", (CURRENT_TERM, NEXT_TERM)):
        for raw in split_raw(r["instructors_raw"]):
            slots[(r["term"], r["days"], r["start_time"], r["end_time"], r["building"], r["room"], raw)].add(
                (r["subject"], r["number"]))
    linked = 0
    for slot, courses in slots.items():
        raw = slot[-1]
        if len(courses) < 2:
            continue
        got = [links.get((raw, s), {}).get(n, (None, "blank")) for s, n in courses]
        keys = {k for k, m in got if k is not None and m not in UNLINKED}
        if len(keys) != 1:
            continue
        key = keys.pop()
        for (s, n), (_k, m) in zip(courses, got, strict=True):
            if m in ("unmatched", "ambiguous"):
                links[(raw, s)][n] = (key, "meets-with")
                matcher.unlog(raw, s, n)
                linked += 1
    return linked


def match_stats(rows: list[sqlite3.Row], links: Links) -> dict[str, list[int]]:
    """Per subject, next term's names: [linked, names, linked on lecture (primary) sections, lecture names]. A name
    counts as linked when every course it teaches next term is."""
    names: dict[tuple[str, str], bool] = {}
    primary: dict[tuple[str, str], bool] = {}
    for r in rows:
        if r["term"] != NEXT_TERM:
            continue
        for raw in split_raw(r["instructors_raw"]):
            k = (raw, r["subject"])
            _key, method = links.get(k, {}).get(r["number"], (None, "blank"))
            if method == "blank":
                continue
            ok = method not in UNLINKED
            names[k] = names.get(k, True) and ok
            if r["component"] == "primary":
                primary[k] = primary.get(k, True) and ok
    stats: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for group, i in ((names, 0), (primary, 2)):
        for (_raw, subj), ok in group.items():
            stats[subj][i + 1] += 1
            stats[subj][i] += ok
    return stats


def run(conn: sqlite3.Connection, gpa_df: pd.DataFrame, rmp_enabled: bool, tre_path: Path,
        unmatched_path: Path, rmp_cache: Path, rmp_transport: object = None) -> str:
    matcher = build_matcher(gpa_df, load_overrides(DATA / "name_overrides.csv"))
    conn.execute("DELETE FROM instructors")
    conn.execute("DELETE FROM instructor_aliases")
    people: dict[str, dict] = {}

    # GPA identities (display name = most recent spelling).
    for r in conn.execute("SELECT instructor_key, instructor_name, last_term FROM gpa_instructor_course"):
        p = parse_name(r["instructor_name"])
        if p is None:
            continue
        cur = people.get(r["instructor_key"])
        if cur is None or term_order(r["last_term"]) > cur["_t"]:
            people[r["instructor_key"]] = {"p": p, "_t": term_order(r["last_term"]), "raw": r["instructor_name"]}

    # Course Explorer names for the current and next term.
    rows, links = match_course_explorer(conn, matcher)
    # (raw, subject, number) -> (key, method); number "" when one person teaches every course under that name
    alias_method: dict[tuple[str, str, str], tuple[str, str]] = {}
    for (raw, subject), per in links.items():
        one = len({k for k, _m in per.values()}) == 1
        for number, (key, method) in per.items():
            if key is None:
                p = parse_name(raw)
                if p is None:
                    continue
                key = f"{p.last}|{p.first_initial}"
                people.setdefault(key, {"p": p, "_t": 0, "raw": raw})
            alias_method[(raw, subject, "" if one else number)] = (key, method)
            if key not in people:  # matched someone whose GPA rows are all older than the stats window
                p = parse_name(raw)
                if p is not None:
                    people[key] = {"p": p, "_t": 0, "raw": raw}
    teaching_next: dict[str, set[str]] = defaultdict(set)       # key -> subjects taught next term
    teach_count: dict[str, int] = defaultdict(int)              # key -> primary sections next term
    cur_count: dict[str, int] = defaultdict(int)                # key -> primary sections this term
    taught_numbers: dict[str, set[str]] = defaultdict(set)      # key -> course numbers (for TRE)
    subjects_of: dict[str, set[str]] = defaultdict(set)         # key -> subjects taught (for RMP), all sources
    courses_of: dict[str, set[str]] = defaultdict(set)          # key -> courses taught ("MATH221"), all sources
    for r in rows:
        for raw in split_raw(r["instructors_raw"]):
            hit = alias_method.get((raw, r["subject"], r["number"])) or alias_method.get((raw, r["subject"], ""))
            if hit is None:
                continue  # blank / TBA
            key = hit[0]
            taught_numbers[key].add(r["number"])
            subjects_of[key].add(r["subject"])
            courses_of[key].add(f"{r['subject']}{r['number']}")
            if r["term"] == CURRENT_TERM and r["component"] == "primary":
                cur_count[key] += 1
            if r["term"] == NEXT_TERM:
                teaching_next[key].add(r["subject"])
                if r["component"] == "primary":
                    teach_count[key] += 1
    for (raw, subj, number), (key, method) in alias_method.items():
        conn.execute("INSERT OR REPLACE INTO instructor_aliases (source, raw_name, subject, number, instructor_key, "
                     "method) VALUES (?,?,?,?,?,?)", ("course-explorer", raw, subj, number, key, method))
    stats = match_stats(rows, links)
    n_unmatched = matcher.write_unmatched(unmatched_path)

    # Teachers Ranked as Excellent (instructors only, recent terms).
    tre: dict[str, list[str]] = defaultdict(list)
    if tre_path.exists():
        tdf = pd.read_csv(tre_path, dtype=str, keep_default_na=False)
        tdf = tdf[(tdf["role"] == "Instructor")]
        tdf = tdf[tdf["term"].map(lambda t: term_order(tre_term(t)) >= term_order(TRE_SINCE))]
        for r in conn.execute("SELECT instructor_key, number FROM gpa_instructor_course"):
            taught_numbers[r[0]].add(r[1])
        by_last_num: dict[tuple[str, str], set[str]] = defaultdict(set)
        for k, nums in taught_numbers.items():
            for n in nums:
                by_last_num[(k.split("|")[0], n)].add(k)
        for t in tdf.to_dict("records"):
            p = parse_name(f"{t['lname']}, {t['fname']}")
            if p is None:
                continue
            keys = {k for k in by_last_num.get((p.last, t["course"]), set())
                    if k in people and compatible(p, people[k]["p"])}
            if len(keys) == 1:
                label = f"{tre_term(t['term'])} {t['ranking']}"
                k = keys.pop()
                if label not in tre[k]:
                    tre[k].append(label)

    # RMP for everyone a course page shows: next term's teachers first, then this term's, then past instructors.
    gpa_recency: dict[str, tuple[int, int]] = {}  # key -> (latest term taught, students graded)
    for r in conn.execute("SELECT instructor_key, subject, number, last_term, students FROM gpa_instructor_course"):
        k = r["instructor_key"]
        subjects_of[k].add(r["subject"])
        courses_of[k].add(f"{r['subject']}{r['number']}")
        last, students = gpa_recency.get(k, (0, 0))
        gpa_recency[k] = (max(last, term_order(r["last_term"])), students + int(r["students"] or 0))

    def priority(key: str) -> tuple:
        if key in teaching_next:
            return (0, -teach_count.get(key, 0), key)
        if key in cur_count:
            return (1, -cur_count[key], key)
        last, students = gpa_recency.get(key, (0, 0))
        return (2, -last, -students, key)

    # only tests pass a transport (a mock): no politeness delay for it, which saved ~10 s of pytest (#148)
    client = RmpClient(rmp_cache, enabled=rmp_enabled, transport=rmp_transport,
                       delay=0.5 if rmp_transport is None else 0.0)
    rmp_ok = rmp_enabled
    rmp_matched: dict[str, int] = defaultdict(int)
    rmp_rows: dict[str, str] = {}
    if rmp_enabled:
        try:
            client.find_school()
        except RmpUnavailable:
            rmp_ok = False
    # Time budget per run (RMP_BUDGET_SECONDS, default 20 min) for questions RMP hasn't answered in the last
    # CACHE_DAYS, in priority order. After it, and if RMP stops answering, cached answers up to STALE_DAYS old are
    # used, so coverage builds up run by run (D18.2).
    budget = float(os.environ.get("RMP_BUDGET_SECONDS", "1200"))
    t_start = time.monotonic()
    looked_up = 0
    budget_hit = False
    order = sorted((k for k in people if subjects_of.get(k)), key=priority)
    if rmp_ok:
        for key in order:
            if not budget_hit and time.monotonic() - t_start > budget:
                budget_hit = True
                client.enabled = False  # cached answers only from here on
            try:
                t = client.lookup(people[key]["raw"], subjects_of[key], courses_of[key])
                looked_up += 1
            except RmpUnavailable:
                continue  # nothing usable cached for this name, and no budget (or no RMP) left this run
            if t is None:
                continue
            rmp_rows[key] = t.rmp_id
            for s in teaching_next.get(key, ()):
                rmp_matched[s] += 1
            conn.execute(
                "INSERT OR REPLACE INTO rmp VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (t.rmp_id, t.first_name, t.last_name, t.department, t.avg_rating, t.avg_difficulty,
                 t.would_take_again_pct, t.num_ratings, json.dumps(t.top_tags), json.dumps(t.reviews),
                 t.fetched_at or datetime.now(UTC).isoformat(timespec="seconds")),
            )
        if client.error and not looked_up:
            rmp_ok = False  # RMP refused every question and nothing was cached
    conn.execute("INSERT OR REPLACE INTO meta VALUES ('rmp_coverage', ?)",
                 (json.dumps({"people": len(order), "looked_up": looked_up, "teaching_next": len(teaching_next),
                              "matched": len(rmp_rows),
                              "matched_next": sum(1 for k in rmp_rows if k in teaching_next),
                              "budget_hit": budget_hit, "error": client.error if rmp_enabled else None}),))
    conn.execute("INSERT OR REPLACE INTO meta VALUES ('rmp_status', ?)",
                 ("ok" if rmp_ok else f"unavailable: {client.error or 'disabled'}",))

    for key, info in people.items():
        p = info["p"]
        conn.execute(
            "INSERT OR REPLACE INTO instructors VALUES (?,?,?,?,?,?,?)",
            (key, p.last, p.first_initial, p.first_name, p.display, rmp_rows.get(key),
             json.dumps(sorted(tre.get(key, []), key=lambda s: term_order(s.split()[0]), reverse=True))),
        )

    teach_counts: dict[str, int] = defaultdict(int)
    for subjects in teaching_next.values():
        for s in subjects:
            teach_counts[s] += 1
    report = {
        s: {"gpa_matched": stats[s][0], "names": stats[s][1],
            "gpa_pct": round(100 * stats[s][0] / stats[s][1], 1) if stats[s][1] else None,
            "primary_matched": stats[s][2], "primary_names": stats[s][3],
            "primary_gpa_pct": round(100 * stats[s][2] / stats[s][3], 1) if stats[s][3] else None,
            "rmp_matched": rmp_matched[s], "rmp_pct": round(100 * rmp_matched[s] / teach_counts[s], 1)
            if teach_counts[s] else None}
        for s in sorted(stats)
    }
    conn.execute("INSERT OR REPLACE INTO meta VALUES ('match_report', ?)", (json.dumps(report),))
    conn.execute("INSERT OR REPLACE INTO meta VALUES ('tre_matched', ?)", (str(len(tre)),))
    return (f"{len(people)} instructors, {n_unmatched} unmatched names logged, TRE badges {len(tre)}, "
            f"RMP {'ok' if rmp_ok else 'unavailable'}")
