"""Export compact JSON for the static site (web/public/data/).

    meta.json                 build info, terms + snapshot dates, GPA windows, RMP status, match report
    search.json               every course with a page + instructors teaching next term (home search)
    geneds.json               gen-ed finder rows (next term)
    course/{SUBJ}/{NUM}.json  everything the course page and schedule builder need for one course
"""

from __future__ import annotations

import itertools
import json
import os
import re
import shutil
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any

from .config import WEB_DATA
from .fetch import CURRENT_TERM, NEXT_TERM
from .names import parse_name, term_order

REPO_URL = "https://github.com/kamransingri/illini-scheduler"
SITE_URL = os.environ.get("SITE_URL", "https://kamransingri.github.io/illini-scheduler")
RECENT_EVENT_DAYS = 7  # "Just opened" page window
ONLINE_TYPES = {"ONL", "OLC", "OLD", "OD", "OLB"}
MAX_BUNDLES = 400


def r3(x: float | None) -> float | None:
    return None if x is None else round(float(x), 3)


def credit_range(text: str) -> list[float]:
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", text or "")]
    if not nums:
        return [0, 0]
    return [min(nums), max(nums)]


def pct(row: sqlite3.Row) -> dict[str, float | None]:
    return {"A": r3(row["pct_A"]), "B": r3(row["pct_B"]), "C": r3(row["pct_C"]), "DF": r3(row["pct_DF"]),
            "W": r3(row["pct_W"])}


def status_open(status: str) -> bool | None:
    s = (status or "").lower()
    if not s:
        return None
    return "open" in s


def bundles(sections: list[dict]) -> list[list[dict]]:
    """Valid section bundles (lecture + its linked discussion/lab...). Mirrors web/lib/schedule.ts."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for s in sections:
        groups[s["group"]].append(s)
    out: list[list[dict]] = []
    for secs in groups.values():
        by_comp: dict[str, list[dict]] = defaultdict(list)
        for s in secs:
            by_comp[s["component"]].append(s)
        if "primary" not in by_comp:
            continue
        for combo in itertools.product(*by_comp.values()):
            out.append(list(combo))
            if len(out) >= MAX_BUNDLES:
                return out
    return out


def bundle_opts(bs: list[list[dict]]) -> list[list[int]]:
    """[[earliest start minute (-1 if none), union day mask, all-online 0/1]] - deduplicated."""
    seen = set()
    for b in bs:
        starts = [m["s"] for s in b for m in s["meetings"] if m["s"] is not None]
        days = 0
        for s in b:
            for m in s["meetings"]:
                days |= m["d"]
        online = int(all(m["s"] is None for s in b for m in s["meetings"]))
        seen.add((min(starts) if starts else -1, days, online))
    return [list(x) for x in sorted(seen)]


def load_profile(js: str | None) -> dict | None:
    if not js:
        return None
    p = json.loads(js)
    return p if any(v["value"] != "unknown" for v in p.values()) else None


def run(conn: sqlite3.Connection, out_dir: Path = WEB_DATA) -> str:
    conn.row_factory = sqlite3.Row
    if out_dir.exists():
        shutil.rmtree(out_dir)
    (out_dir / "course").mkdir(parents=True)
    meta_rows = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")}
    terms = {r["term"]: dict(r) for r in conn.execute("SELECT * FROM terms")}
    live_terms = [t for t in (CURRENT_TERM, NEXT_TERM) if t in terms]

    # ---- instructors -------------------------------------------------------------------------------------
    people = {r["instructor_key"]: dict(r) for r in conn.execute("SELECT * FROM instructors")}
    rmp = {r["rmp_id"]: dict(r) for r in conn.execute("SELECT * FROM rmp")}
    alias = {(r["raw_name"], r["subject"]): r["instructor_key"]
             for r in conn.execute("SELECT raw_name, subject, instructor_key FROM instructor_aliases")}

    def ikey(raw: str, subject: str) -> str:
        k = alias.get((raw, subject))
        if k:
            return k
        p = parse_name(raw)
        return f"{p.last}|{p.first_initial}" if p else raw

    # Full last names as Course Explorer prints them (the GPA dataset clips long names at 25 chars).
    ce_last: dict[str, str] = {}
    for (raw, _subj), k in alias.items():
        last = raw.split(",")[0].strip()
        if len(last) > len(ce_last.get(k, "")):
            ce_last[k] = last

    def display(key: str, fallback: str = "") -> str:
        if key in people:
            disp = str(people[key]["display_name"])
            full = ce_last.get(key, "")
            if " " in disp and full:
                first, gpa_last = disp.split(" ", 1)
                if full.lower().startswith(gpa_last.lower()) and len(full) > len(gpa_last):
                    return f"{first} {full}"
            return disp
        p = parse_name(fallback)
        return p.display if p else fallback or key

    def rmp_block(key: str) -> dict | None:
        rid = people.get(key, {}).get("rmp_id")
        if not rid or rid not in rmp:
            return None
        t = rmp[rid]
        return {"id": rid, "url": f"https://www.ratemyprofessors.com/professor/{rid}", "rating": t["avg_rating"],
                "difficulty": t["avg_difficulty"], "would_take_again": t["would_take_again_pct"],
                "num_ratings": t["num_ratings"], "tags": json.loads(t["top_tags"] or "[]"),
                "reviews": json.loads(t["reviews_json"] or "[]"), "fetched_at": t["fetched_at"]}

    # ---- per-course gathering ---------------------------------------------------------------------------
    courses: dict[tuple[str, str], dict[str, dict]] = defaultdict(dict)
    for r in conn.execute("SELECT * FROM courses"):
        courses[(r["subject"], r["number"])][r["term"]] = dict(r)
    gpa_course = {(r["subject"], r["number"]): dict(r) for r in conn.execute("SELECT * FROM gpa_course")}
    gpa_terms: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in conn.execute("SELECT * FROM gpa_course_term"):
        gpa_terms[(r["subject"], r["number"])].append(
            {"term": r["term"], "gpa": r3(r["avg_gpa"]), "students": r["students"], "pct": pct(r)})
    gpa_inst: dict[tuple[str, str], dict[str, dict]] = defaultdict(dict)
    for r in conn.execute("SELECT * FROM gpa_instructor_course"):
        gpa_inst[(r["subject"], r["number"])][r["instructor_key"]] = {
            "avg": r3(r["avg_gpa"]), "recent": r3(r["recent_avg_gpa"]), "students": r["students"],
            "n_terms": r["n_terms"], "first_term": r["first_term"], "last_term": r["last_term"],
            "delta": r3(r["delta_vs_course"]), "limited": bool(r["limited_data"]), "pct": pct(r),
            "raw": r["instructor_name"]}
    patterns = {(r["subject"], r["number"]): dict(r) for r in conn.execute("SELECT * FROM offering_pattern")}
    offerings: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in conn.execute("SELECT * FROM offerings"):
        offerings[(r["subject"], r["number"])].append(
            {"term": r["term"], "n_sections": r["n_sections"], "online_share": r3(r["online_share"]),
             "instructors": [p.strip() for p in (r["instructors"] or "").split(";") if p.strip()]})
    changes: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in conn.execute("SELECT * FROM course_changes"):
        changes[(r["subject"], r["number"])].append({"term": r["term"], "field": r["field"], "summary": r["summary"]})
    exam: dict[tuple[str, str], dict[str, dict]] = defaultdict(dict)
    for r in conn.execute("SELECT * FROM exam_format"):
        p = load_profile(r["profile_json"])
        if p:
            exam[(r["subject"], r["number"])][r["instructor_key"]] = p
    geneds = {(r["subject"], r["number"]): dict(r) for r in conn.execute("SELECT * FROM geneds")}
    subjects = {r["subject"]: r["name"] for r in conn.execute("SELECT * FROM subjects")}
    sections: dict[tuple[str, str], dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    meet: dict[tuple[str, str], list[dict]] = defaultdict(list)
    qmarks = ",".join("?" * len(live_terms))
    for r in conn.execute(f"SELECT * FROM meetings WHERE term IN ({qmarks})", live_terms):
        meet[(r["term"], r["crn"])].append(
            {"d": r["days"], "s": r["start_time"], "e": r["end_time"], "b": r["building"] or "", "r": r["room"] or ""})
    status_at = {(r[0], r[1]): (r[2], r[3] or "") for r in
                 conn.execute("SELECT term, crn, checked_at, since FROM availability")}
    seat_events: dict[tuple[str, str], list[dict]] = defaultdict(list)
    all_events: list[dict] = []
    for r in conn.execute("SELECT term, at, crn, subject, number, code, old, new FROM seat_events ORDER BY at DESC"):
        ev = {"term": r[0], "at": r[1], "crn": r[2], "s": r[3], "n": r[4], "code": r[5], "old": r[6], "new": r[7]}
        seat_events[(r[3], r[4])].append(ev)
        all_events.append(ev)
    for r in conn.execute(f"SELECT * FROM sections WHERE term IN ({qmarks}) ORDER BY section_code", live_terms):
        raws = [p.strip() for p in (r["instructors_raw"] or "").split(";") if p.strip()]
        sections[(r["subject"], r["number"])][r["term"]].append({
            "crn": r["crn"], "code": r["section_code"], "type": r["type"], "type_name": r["type_name"],
            "component": r["component"], "group": r["link_group"], "part": r["part_of_term"] or "1",
            "status": r["enrollment_status"] or "", "status_code": r["status_code"],
            "status_at": status_at.get((r["term"], r["crn"]), ("", ""))[0],
            "status_since": status_at.get((r["term"], r["crn"]), ("", ""))[1],
            "credits": r["section_credit_hours"] or "", "title": r["section_title"] or "",
            "text": " ".join(filter(None, (r["section_text"], r["section_notes"]))),
            "meetings": meet.get((r["term"], r["crn"]), []),
            "instructors": [ikey(x, r["subject"]) for x in raws], "instructors_raw": raws, "special": "",
        })
    notes = _load_notes()
    for by_term in sections.values():
        for secs in by_term.values():
            flag_special(secs)

    keys = {k for k, ts in courses.items() if any(t in ts for t in live_terms)}
    keys |= {k for k, g in gpa_course.items() if g["recent_avg_gpa"] is not None}
    search_courses, gened_rows = [], []
    teach_next: dict[str, set[str]] = defaultdict(set)
    n_files = 0
    recent_terms = meta_rows.get("gpa_recent", "").split(",")
    for key in sorted(keys):
        subj, num = key
        recs = courses.get(key, {})
        latest_term = max(recs, key=term_order) if recs else None
        rec = recs.get(latest_term, {}) if latest_term else {}
        g = gpa_course.get(key)
        title = rec.get("title") or (g or {}).get("title") or f"{subj} {num}"
        codes = (rec.get("gened_codes") or "").split()
        gen = geneds.get(key)
        if gen:
            codes = sorted(set(codes) | set(gen["codes"].split()))
        cats = sorted({GENED_CAT.get(c, c) for c in codes})
        term_blocks: dict[str, Any] = {}
        inst_keys: dict[str, set[str]] = defaultdict(set)
        for t in live_terms:
            secs = sections[key].get(t, [])
            if not secs and t not in recs:
                continue
            known = any(s["status"] for s in secs)
            prim = [s for s in secs if s["component"] == "primary"]
            n_open = sum(1 for s in prim if status_open(s["status"])) if known else None
            term_blocks[t] = {"label": terms[t]["label"], "checked_at": terms[t]["checked_at"],
                              "source": terms[t]["source"], "status_known": known,
                              "n_primary": len(prim), "n_open": n_open, "sections": secs}
            for s in secs:
                for k in s["instructors"]:
                    inst_keys[k].add(t)
                    if t == NEXT_TERM:
                        teach_next[k].add(f"{subj} {num}")
        raw_for: dict[str, str] = {}
        for t in term_blocks.values():
            for s in t["sections"]:
                for k, raw in zip(s["instructors"], s["instructors_raw"], strict=False):
                    raw_for.setdefault(k, raw)
        inst_out = {}
        all_inst = set(inst_keys) | set(gpa_inst.get(key, {}))
        for k in all_inst:
            gi = gpa_inst.get(key, {}).get(k)
            inst_out[k] = {
                "name": display(k, raw_for.get(k) or (gi or {}).get("raw", "")),
                "teaching": sorted(inst_keys.get(k, set()), key=term_order),
                "gpa": {kk: vv for kk, vv in gi.items() if kk != "raw"} if gi else None,
                "rmp": rmp_block(k) if k in inst_keys else None,
                "exam": exam.get(key, {}).get(k),
                "tre": json.loads(people.get(k, {}).get("excellent_terms") or "[]")[:6],
                "in_gpa_dataset": k in people and k in gpa_inst.get(key, {}),
            }
        pat = patterns.get(key)
        ch = sorted(changes.get(key, []), key=lambda c: (term_order(c["term"]), c["field"]), reverse=True)
        recent_ch = [c for c in ch if c["term"] in live_terms]
        biggest = next((c for c in recent_ch if c["field"] in ("prereq_text", "credit_hours", "title", "gened_codes",
                                                                 "delivery")), recent_ch[0] if recent_ch else None)
        gpa_block = None
        if g:
            gpa_block = {
                "avg": r3(g["avg_gpa"]), "recent": r3(g["recent_avg_gpa"]), "students": g["students"],
                "recent_students": g["recent_students"], "terms_covered": g["terms_covered"],
                "first_term": g["first_term"], "last_term": g["last_term"],
                "recent_terms": [recent_terms[0], recent_terms[-1]] if recent_terms[0] else [],
                "pct": {"A": r3(g["pct_A"]), "B": r3(g["pct_B"]), "C": r3(g["pct_C"]), "DF": r3(g["pct_DF"]),
                        "W": r3(g["pct_W"])},
                "by_term": sorted(gpa_terms.get(key, []), key=lambda x: term_order(x["term"])),
            }
        doc = {
            "subject": subj, "number": num, "title": title, "subject_name": subjects.get(subj, ""),
            "credits": rec.get("credit_hours", ""), "credit_range": credit_range(rec.get("credit_hours", "")),
            "description": rec.get("description", ""), "prereq": rec.get("prereq_text", ""),
            "section_info": rec.get("section_info_text", ""), "schedule_info": rec.get("schedule_info_text", ""),
            "latest_term": latest_term, "geneds": {"codes": codes, "categories": cats},
            "gpa": gpa_block,
            "pattern": {"label": pat["label"], "target": pat["next_term"], "likelihood": pat["likelihood"],
                        "reason": pat["reason"]} if pat else None,
            "history": sorted(offerings.get(key, []), key=lambda o: term_order(o["term"])),
            "terms": term_blocks, "instructors": inst_out, "changes": ch, "biggest_change": biggest,
            "exam_course": exam.get(key, {}).get("*"),
            "notes": notes.get(key, []),
            "seat_events": seat_events.get(key, [])[:40],
        }
        d = out_dir / "course" / subj
        d.mkdir(exist_ok=True)
        (d / f"{num}.json").write_text(json.dumps(doc, separators=(",", ":")))
        n_files += 1
        nxt = term_blocks.get(NEXT_TERM)
        search_courses.append({
            "s": subj, "n": num, "t": title, "c": rec.get("credit_hours", "").replace(" hours.", ""),
            "g": codes, "gpa": r3(g["recent_avg_gpa"] if g and g["recent_avg_gpa"] is not None else
                                  (g["avg_gpa"] if g else None)),
            "nx": int(bool(nxt and nxt["sections"])),
            "cu": int(bool(term_blocks.get(CURRENT_TERM, {}).get("sections"))),
        })
        if codes and ((nxt and nxt["sections"]) or gen):
            nxt = nxt or {"sections": [], "n_primary": 0, "n_open": None, "status_known": False}
            secs = [s for s in nxt["sections"] if s["status_code"] != "P"]
            bs = bundles(secs)
            best = None
            for k in teach_next_course(nxt):
                gi = gpa_inst.get(key, {}).get(k)
                if gi and gi["students"] >= 60 and (best is None or (gi["recent"] or gi["avg"]) > best["gpa"]):
                    best = {"key": k, "name": display(k), "gpa": gi["recent"] or gi["avg"], "students": gi["students"]}
            rmp_best = max((b["rating"] for k in teach_next_course(nxt) if (b := rmp_block(k)) and b["rating"]),
                           default=None)
            gened_rows.append({
                "s": subj, "n": num, "t": title, "codes": codes, "cats": cats,
                "cr": credit_range(rec.get("credit_hours", "")),
                "gpa": r3(g["recent_avg_gpa"]) if g else None, "gpaN": g["recent_students"] if g else 0,
                "pctA": r3(g["pct_A"]) if g else None,
                "nSec": nxt["n_primary"], "nOpen": nxt["n_open"], "statusKnown": nxt["status_known"],
                "best": best, "rmp": rmp_best, "opts": bundle_opts(bs),
            })

    inst_index = sorted(
        ({"name": display(k), "k": k, "c": sorted(v)} for k, v in teach_next.items()), key=lambda x: str(x["name"]))
    (out_dir / "search.json").write_text(json.dumps({"courses": search_courses, "instructors": inst_index},
                                                    separators=(",", ":")))
    (out_dir / "geneds.json").write_text(json.dumps(gened_rows, separators=(",", ":")))
    titles = {(c["s"], c["n"]): c["t"] for c in search_courses}
    write_seat_feeds(out_dir, all_events, titles)
    meta = {
        "built_at": meta_rows.get("built_at"), "current_term": CURRENT_TERM, "next_term": NEXT_TERM,
        "terms": {t: {k: terms[t][k] for k in ("label", "source", "checked_at")} for t in live_terms},
        "gpa": {"window": meta_rows.get("gpa_window", "").split(","), "recent": recent_terms,
                "snapshot": meta_rows.get("gpa_snapshot")},
        "geneds_snapshot": meta_rows.get("geneds_snapshot"),
        "rmp_status": meta_rows.get("rmp_status", "unavailable: not run"),
        "match_report": json.loads(meta_rows.get("match_report", "{}")),
        "repo_url": REPO_URL, "n_courses": n_files,
        "history_terms": sorted(terms, key=term_order),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=1))
    return f"{n_files} course files, {len(gened_rows)} gen-ed rows, {len(inst_index)} instructors -> {out_dir}"


SPECIAL_NOTE = re.compile(r"reserved for|learning community|is for students (?:at|in|of)|only for students", re.I)


def is_open(status: str) -> bool:
    return "open" in (status or "").lower()


def write_seat_feeds(out_dir: Path, events: list[dict], titles: dict[tuple[str, str], str]) -> None:
    """data/seat-events.json (last week, for the "Just opened" page) and an RSS feed per course
    (data/feeds/{SUBJ}/{NUM}.xml) so students can watch seats in any feed reader."""
    from datetime import UTC, datetime, timedelta
    from email.utils import format_datetime
    from xml.sax.saxutils import escape

    cutoff = (datetime.now(UTC) - timedelta(days=RECENT_EVENT_DAYS)).isoformat(timespec="seconds")
    recent = [e | {"t": titles.get((e["s"], e["n"]), "")} for e in events if e["at"] >= cutoff]
    (out_dir / "seat-events.json").write_text(json.dumps(recent[:3000], separators=(",", ":")))
    by_course: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for e in events:
        by_course[(e["s"], e["n"])].append(e)
    feeds = out_dir / "feeds"
    now = format_datetime(datetime.now(UTC))
    for (subj, num), title in titles.items():
        evs = by_course.get((subj, num), [])[:50]
        page = f"{SITE_URL}/course/{subj}/{num}/"
        items = []
        for e in evs:
            if is_open(e["new"]) and not is_open(e["old"]):
                verb = "opened"
            elif "closed" in e["new"].lower():
                verb = "closed"
            else:
                verb = "changed"
            label = f"{subj} {num} {e['code']} (CRN {e['crn']}) {verb}: {e['old']} → {e['new']}"
            guid = e["term"] + e["crn"] + e["at"]
            when = format_datetime(datetime.fromisoformat(e["at"]))
            items.append(f"<item><title>{escape(label)}</title><link>{escape(page)}</link>"
                         f'<guid isPermaLink="false">{escape(guid)}</guid><pubDate>{when}</pubDate></item>')
        d = feeds / subj
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{num}.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'
            f"<title>{escape(subj + ' ' + num + ' seat changes · Illini Scheduler')}</title>"
            f"<link>{escape(page)}</link><description>"
            f"{escape(f'Open/Closed changes for {subj} {num}: {title}. Checked about once a day.')}</description>"
            f"<lastBuildDate>{now}</lastBuildDate>{''.join(items)}</channel></rss>")


def flag_special(secs: list[dict]) -> None:
    """Mark sections that look restricted / special-purpose (DECISIONS.md D9.3):
    a code with a symbol ('AD@'), or a lecture whose letter group has none of the discussion/lab components
    that every other group of the course has (e.g. CS 124 'WWC' alongside 'AL1' + 'AY*')."""
    comps = {s["component"] for s in secs}
    groups: dict[str, set[str]] = defaultdict(set)
    for s in secs:
        groups[s["group"]].add(s["component"])
    full = [g for g, c in groups.items() if c == comps]
    for s in secs:
        if s["code"] and not re.fullmatch(r"[A-Za-z0-9]+", s["code"]):
            s["special"] = "Unusual section code: usually a restricted or special-program section"
        elif len(comps) > 1 and s["group"] != "*" and full and groups[s["group"]] != comps:
            s["special"] = ("Has no linked discussion/lab unlike the other sections: "
                            "likely restricted or special-program")
        elif SPECIAL_NOTE.search(s["text"]):
            s["special"] = "Section notes say it is reserved for a specific group"


def teach_next_course(term_block: dict) -> list[str]:
    seen: list[str] = []
    for s in term_block["sections"]:
        if s["component"] != "primary":
            continue
        for k in s["instructors"]:
            if k not in seen:
                seen.append(k)
    return seen


GENED_CAT = {"ACP": "ACP", "COMP1": "COMP1", "US": "CS", "WCC": "CS", "NW": "CS", "HP": "HUM", "LA": "HUM",
             "PS": "NAT", "LS": "NAT", "QR1": "QR", "QR2": "QR", "SS": "SBS", "BSC": "SBS"}


def _load_notes() -> dict[tuple[str, str], list[dict]]:
    from .notes import load_all

    out: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for n in load_all():
        out[(n.subject, n.number)].append({"instructor": n.instructor, "term": n.term, "text": n.text,
                                           "source": n.source})
    return out
