import json

from pipeline import db, summer


def section(conn, term, crn, subj, num, typ="ONL", pot="S2", component="primary"):
    conn.execute("INSERT INTO sections (term, crn, subject, number, type, part_of_term, component) "
                 "VALUES (?,?,?,?,?,?,?)", (term, crn, subj, num, typ, pot, component))


def course(conn, term, subj, num, title, hours="3 hours.", gened=""):
    conn.execute("INSERT INTO courses (term, subject, number, title, credit_hours, gened_codes) VALUES (?,?,?,?,?,?)",
                 (term, subj, num, title, hours, gened))


def test_the_newest_summer_lists_its_classes(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    for t in ("2024-su", "2025-su", "2026-su"):
        section(conn, t, f"1{t[:4]}", "ECON", "102")
    section(conn, "2026-su", "2", "ECON", "102", typ="LEC", pot="S1")  # one on campus in Session I
    section(conn, "2026-su", "3", "ECON", "102", typ="DIS", component="DIS")  # secondaries don't count
    section(conn, "2026-su", "4", "STAT", "100", pot="1")
    section(conn, "2026-su", "5", "STAT", "100", typ="OLC", pot="S2A")
    section(conn, "2026-su", "6", "ECON", "490", typ="IND", pot="1")  # independent study only: not a class
    section(conn, "2026-fa", "7", "ECON", "102", typ="LEC", pot="1")
    course(conn, "2026-su", "ECON", "102", "Microeconomic Principles", gened="SS")
    course(conn, "2026-su", "STAT", "100", "Statistics", hours="3 OR 4 hours.", gened="QR2")
    conn.execute("INSERT INTO gpa_course (subject, number, recent_avg_gpa, recent_students) "
                 "VALUES ('STAT', '100', 3.21, 900)")

    data = summer.build(conn, ("2026-fa", "2027-sp"))
    assert data is not None
    assert (data["term"], data["label"], data["next_label"]) == ("2026-su", "Summer 2026", "Summer 2027")
    assert not data["upcoming"]
    assert data["recent"] == ["2024-su", "2025-su", "2026-su"]
    econ, stat = data["courses"]
    assert econ == {"s": "ECON", "n": "102", "t": "Microeconomic Principles", "cr": [3.0, 3.0], "codes": ["SS"],
                    "nSec": 2, "online": "some", "sess": ["S1", "S2"], "ran": 3, "gpa": None, "page": True}
    assert stat["sess"] == ["full", "S2A"] and stat["online"] == "all" and stat["ran"] == 1
    assert stat["cr"] == [3.0, 4.0] and stat["gpa"] == 3.21 and stat["page"] is False

    # a course with recent grades has a course file even when it isn't offered this term or next
    assert summer.build(conn, ("2026-fa", "2027-sp"), {("ECON", "102"), ("STAT", "100")})["courses"][1]["page"] is True  # type: ignore[index]
    assert summer.export(conn, tmp_path, ("2026-fa", "2027-sp")) == "2 Summer 2026 classes"
    assert json.loads((tmp_path / "summer.json").read_text(encoding="utf-8"))["courses"][1]["s"] == "STAT"


def test_after_the_spring_rollover_the_summer_is_ahead(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    section(conn, "2027-su", "1", "ECON", "102")
    data = summer.build(conn, ("2027-sp", "2027-fa"))
    assert data is not None and data["upcoming"] and data["label"] == "Summer 2027"


def test_no_summer_loaded(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    assert summer.build(conn) is None
    assert summer.export(conn, tmp_path) == "no summer term loaded"
    assert not (tmp_path / "summer.json").exists()


def test_session_ids():
    assert [summer.session_id(p) for p in ("1", "SF", "LF", "S1", "S2B", "", "Z9")] == \
        ["full", "full", "full", "S1", "S2B", "other", "other"]
