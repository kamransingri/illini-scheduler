from pipeline import availability, course_explorer, db
from pipeline.availability import parse_course_page, record_page
from pipeline.config import FIXTURES

PAGE = (FIXTURES / "course-explorer-web" / "2026-fa_CS124.html").read_bytes()


def test_parse_course_page_details_and_rows():
    p = parse_course_page(PAGE)
    assert p["title"] == "Introduction to Computer Science I" and p["credits"] == "3 hours."
    assert p["description"].startswith("Basic concepts in computing") and "MATH 112" in p["info"]
    assert p["geneds"] == ["Quantitative Reasoning I"]
    by = {s["code"]: s for s in p["sections"]}
    assert len(p["sections"]) == 17
    qba = by["QBA"]
    assert qba["crn"] == "74481" and qba["status"] == "Open" and qba["type_name"] == "Laboratory-Discussion"
    assert qba["meetings"] == [{"start": 600, "end": 650, "days": "T", "room": "4025",
                                "building": "Campus Instructional Facility", "type_name": "Laboratory-Discussion",
                                "instructors": ["Challen, G"]}]
    wwc = by["WWC"]  # three meetings: W, M, and an arranged online one
    assert [(m["days"], m["start"]) for m in wwc["meetings"]] == [("W", 960), ("M", 1020), ("n.a.", None)]
    assert "Wilbur Wright" in wwc["notes"]
    assert by["AL1"]["meetings"][0]["start"] is None  # ARRANGED online lecture


def test_record_page_logs_status_changes():
    d = availability.load_file("1999-sp")
    p = parse_course_page(PAGE)
    record_page(d, "CS 124", p, "2026-11-01T00:00:00+00:00")
    assert d["events"] == [] and d["sections"]["74481"] == ["Open", "2026-11-01T00:00:00+00:00", ""]
    for s in p["sections"]:
        if s["crn"] == "74481":
            s["status"] = "Closed"
    record_page(d, "CS 124", p, "2026-11-02T00:00:00+00:00")
    assert d["events"] == [["2026-11-02T00:00:00+00:00", "74481", "CS 124", "QBA", "Open", "Closed"]]
    assert d["sections"]["74481"][2] == "2026-11-02T00:00:00+00:00"  # closed since
    record_page(d, "CS 124", p, "2026-11-03T00:00:00+00:00")
    assert d["sections"]["74481"][2] == "2026-11-02T00:00:00+00:00" and len(d["events"]) == 1


def test_apply_web_rows_replaces_mirror_sections(tmp_path, monkeypatch):
    monkeypatch.setattr(availability, "AVAIL_DIR", tmp_path)
    d = availability.load_file("2026-fa")
    record_page(d, "CS 124", parse_course_page(PAGE), "2026-11-04T00:00:00+00:00")
    new_page = parse_course_page(PAGE)
    new_page["title"] = "Brand New Course"
    for sec in new_page["sections"]:
        sec["crn"] = "9" + sec["crn"][1:]  # CRNs are unique within a term
    record_page(d, "CS 999", new_page, "2026-11-04T00:00:00+00:00")
    availability.save_file("2026-fa", d)
    conn = db.connect(tmp_path / "t.db")
    c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / "2026-fa.csv", {"CS"})
    course_explorer.store(conn, "2026-fa", c, s, "wade-course-catalog", "2026-03-25")
    monkeypatch.setenv("AVAILABILITY_MODE", "file")
    msg = availability.run(conn, ["2026-fa"])
    assert "1 courses not in the mirror" in msg
    rows = conn.execute("SELECT m.days, m.start_time FROM meetings m JOIN sections s USING (term, crn) "
                        "WHERE s.section_code='WWC' AND s.number='124' ORDER BY idx").fetchall()
    assert [tuple(r) for r in rows][:2] == [(4, 960), (1, 1020)]  # web times, not the stale mirror's M/R 4:30
    assert conn.execute("SELECT enrollment_status FROM sections WHERE crn='74481'").fetchone()[0] == "Open"
    assert conn.execute("SELECT title FROM courses WHERE subject='CS' AND number='999'").fetchone()[0] == \
        "Brand New Course"
    link = conn.execute("SELECT component, link_group FROM sections WHERE crn='74481'").fetchone()
    assert link[0] == "LBD"
