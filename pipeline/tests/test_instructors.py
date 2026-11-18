import json

import httpx

from pipeline import course_explorer, db, gpa, instructors
from pipeline.config import FIXTURES


def build(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    for term in ("2026-fa", "2027-sp"):
        c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / f"{term}.csv")
        course_explorer.store(conn, term, c, s, "wade-course-catalog", "")
    df = gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv")
    gpa.store(conn, gpa.compute(df))
    return conn, df


def test_pipeline_survives_blocked_rmp(tmp_path):
    conn, df = build(tmp_path)
    blocked = httpx.MockTransport(lambda r: httpx.Response(403))
    msg = instructors.run(conn, df, True, tmp_path / "none.csv", tmp_path / "unmatched.csv", tmp_path / "rmp",
                          rmp_transport=blocked)
    assert "RMP unavailable" in msg
    status = conn.execute("SELECT value FROM meta WHERE key='rmp_status'").fetchone()[0]
    assert status.startswith("unavailable")
    # Challen (CS 124, Fall 2026) is linked to the GPA identity.
    row = conn.execute("SELECT instructor_key, method FROM instructor_aliases WHERE raw_name='Challen, G'").fetchone()
    assert row["instructor_key"] == "challen|geoffrey"
    report = json.loads(conn.execute("SELECT value FROM meta WHERE key='match_report'").fetchone()[0])
    assert set(report) >= {"CS", "STAT"}
    assert (tmp_path / "unmatched.csv").exists()


def test_rmp_loop_with_instructors_outside_gpa_window(tmp_path):
    """Regression: an instructor matched to GPA rows older than the stats window must not crash the RMP loop."""
    conn = db.connect(tmp_path / "t.db")
    for term in ("2026-fa", "2027-sp"):
        c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / f"{term}.csv")
        course_explorer.store(conn, term, c, s, "wade-course-catalog", "")
    df = gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv")
    gpa.store(conn, gpa.compute(df, window_start="2026-sp"))  # tiny window: most matches fall outside it
    school = json.loads((FIXTURES / "rmp" / "school_search.json").read_text(encoding="utf-8"))
    empty = {"data": {"newSearch": {"teachers": {"edges": []}}}}

    def handler(request):
        body = json.loads(request.content)
        return httpx.Response(200, json=school if "schools" in body["query"] else empty)

    msg = instructors.run(conn, df, True, tmp_path / "none.csv", tmp_path / "u.csv", tmp_path / "rmp",
                          rmp_transport=httpx.MockTransport(handler))
    assert "RMP ok" in msg
    cov = json.loads(conn.execute("SELECT value FROM meta WHERE key='rmp_coverage'").fetchone()[0])
    assert cov["looked_up"] == cov["people"] > cov["teaching_next"] > 0  # everyone a course page shows


def test_rmp_covers_this_terms_and_past_instructors_after_next_terms(tmp_path):
    """#8: Kim Whittlesey taught MATH 221 in Fall 2026 but not Spring 2027, so she was never looked up and MATH 221
    said "No RMP match" over her 104 ratings. In the fixtures Challen teaches only in Fall 2026 and Whittlesey only
    appears in the grade history."""
    conn, df = build(tmp_path)
    school = json.loads((FIXTURES / "rmp" / "school_search.json").read_text(encoding="utf-8"))
    people = {"Challen": ("Geoffrey", "Computer Science", "CS124"), "Whittlesey": ("Kim", "Mathematics", "MATH221")}
    searched = []

    def handler(request):
        body = json.loads(request.content)
        if "schools" in body["query"]:
            return httpx.Response(200, json=school)
        text = body["variables"]["query"]["text"]
        searched.append(text)
        edges = []
        if text in people:
            first, dept, course = people[text]
            review = {"node": {"comment": "Clear lectures.", "class": course, "date": "2026-05-01"}}
            edges = [{"node": {"legacyId": len(searched), "firstName": first, "lastName": text, "department": dept,
                               "numRatings": 5, "ratings": {"edges": [review]}}}]
        return httpx.Response(200, json={"data": {"newSearch": {"teachers": {"edges": edges}}}})

    instructors.run(conn, df, True, tmp_path / "none.csv", tmp_path / "u.csv", tmp_path / "rmp",
                    rmp_transport=httpx.MockTransport(handler))
    matched = {r[0] for r in conn.execute("SELECT instructor_key FROM instructors WHERE rmp_id IS NOT NULL")}
    assert {"challen|geoffrey", "whittlesey|kim"} <= matched
    rows = conn.execute("SELECT instructors_raw FROM sections WHERE term='2027-sp'")
    next_last = {raw.split(",")[0] for (names,) in rows for raw in instructors.split_raw(names)}
    first_other = min(i for i, s in enumerate(searched) if s not in next_last)
    assert all(s in next_last for s in searched[:first_other])  # next term's teachers are asked first
    assert searched.index("Challen") < searched.index("Whittlesey")  # then this term's, then past instructors


def _section(conn, term, crn, subj, num, raw, room="3101", start=840, component="primary"):
    conn.execute("INSERT INTO sections (term, crn, subject, number, days, start_time, end_time, building, room, "
                 "instructors_raw, component) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                 (term, crn, subj, num, 10, start, start + 80, "Sidney Lu Mech Engr Bldg", room, raw, component))


def test_meets_with_cross_listings_and_two_people_under_one_name(tmp_path):
    """#12: CS 498 meets with NPRE 498 (same days, time, room and name); MATH 464 is the catalog's twin of STAT 410;
    "Li, H" in HIST is two people."""
    from pipeline.names import InstructorMatcher

    conn = db.connect(tmp_path / "t.db")
    _section(conn, "2027-sp", "1", "NPRE", "498", "Kozlowski, T")
    _section(conn, "2027-sp", "2", "CS", "498", "Kozlowski, T")
    _section(conn, "2027-sp", "3", "MATH", "464", "Stepanov, A", room="1", start=600)
    _section(conn, "2027-sp", "4", "HIST", "120", "Li, H", room="2", start=600)
    _section(conn, "2026-fa", "5", "HIST", "100", "Li, H", room="3", start=600)
    _section(conn, "2027-sp", "6", "CS", "124", "Nobody, Q", room="4", start=600)
    conn.execute("INSERT INTO courses (term, subject, number, description) VALUES "
                 "('2027-sp', 'MATH', '464', 'Same as STAT 410. 4 hours.')")
    m = InstructorMatcher()
    for raw, subj, num, term in [("Kozlowski, Tomasz", "NPRE", "455", "2025-fa"),
                                 ("Kozlowski, Tanya", "EPS", "202", "2011-sp"),
                                 ("Stepanov, Alexey G", "STAT", "410", "2026-sp"),
                                 ("Stepanov, Anna", "CHEM", "102", "2025-fa"),
                                 ("Li, Hanping", "HIST", "100", "2022-fa"), ("Li, Hanping", "HIST", "120", "2021-fa"),
                                 ("Li, Haiyi", "HIST", "120", "2025-sp")]:
        m.add(raw, subj, num, term)
    rows, links = instructors.match_course_explorer(conn, m)
    assert links[("Kozlowski, T", "CS")] == {"498": ("kozlowski|tomasz", "meets-with")}
    assert links[("Stepanov, A", "MATH")] == {"464": ("stepanov|alexey", "cross-listed")}
    assert links[("Li, H", "HIST")] == {"120": ("li|haiyi", "recent-course"), "100": ("li|hanping", "recent-course")}
    assert [u["raw_name"] for u in m.unmatched] == ["Nobody, Q"]
    stats = instructors.match_stats(rows, links)
    assert stats["CS"] == [1, 2, 1, 2] and stats["HIST"] == [1, 1, 1, 1]


def test_an_old_database_gets_the_per_course_alias_table(tmp_path):
    import sqlite3

    old = sqlite3.connect(tmp_path / "old.db")
    old.execute("CREATE TABLE instructor_aliases (source TEXT, raw_name TEXT, subject TEXT, instructor_key TEXT, "
                "method TEXT, PRIMARY KEY (source, raw_name, subject))")
    old.commit()
    old.close()
    conn = db.connect(tmp_path / "old.db")
    assert "number" in {r[1] for r in conn.execute("PRAGMA table_info(instructor_aliases)")}
    conn.execute("INSERT INTO instructor_aliases (source, raw_name, subject, number, instructor_key, method) "
                 "VALUES ('course-explorer', 'Li, H', 'HIST', '120', 'li|haiyi', 'recent-course')")
