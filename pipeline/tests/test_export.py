import json

from pipeline import course_explorer, db, exam_format, export, gpa, instructors, offerings
from pipeline.config import FIXTURES
from pipeline.export import bundle_opts, bundles, credit_range


def test_credit_range():
    assert credit_range("3 OR 4 hours.") == [3, 4]
    assert credit_range("1 TO 4 hours.") == [1, 4]
    assert credit_range("") == [0, 0]


def _sec(crn, comp, group, d, s, e):
    return {"crn": crn, "component": comp, "group": group, "meetings": [{"d": d, "s": s, "e": e}]}


def test_bundles_respect_groups():
    secs = [_sec("1", "primary", "A", 10, 600, 650), _sec("2", "DIS", "A", 4, 540, 590),
            _sec("3", "primary", "B", 10, 700, 750), _sec("4", "DIS", "B", 16, 480, 530)]
    bs = bundles(secs)
    assert sorted(tuple(s["crn"] for s in b) for b in bs) == [("1", "2"), ("3", "4")]
    assert bundle_opts(bs) == [[480, 26, 0], [540, 14, 0]]


def test_export_end_to_end(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    for term in ("2026-fa", "2027-sp"):
        c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / f"{term}.csv")
        course_explorer.store(conn, term, c, s, "wade-course-catalog", "2026-10-30T00:00:00-05:00")
    df = gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv")
    res = gpa.compute(df)
    gpa.store(conn, res)
    db.set_meta(conn, "gpa_recent", ",".join(res.recent))
    instructors.run(conn, df, False, tmp_path / "x.csv", tmp_path / "u.csv", tmp_path / "rmp")
    offerings.run(conn, "2027-sp")
    exam_format.run(conn)
    msg = export.run(conn, tmp_path / "out")
    assert "course files" in msg
    cs = json.loads((tmp_path / "out" / "course" / "CS" / "124.json").read_text())
    assert cs["gpa"]["recent"] and cs["terms"]["2027-sp"]["sections"]
    assert cs["terms"]["2027-sp"]["status_known"] is False  # pre-registration snapshot
    math = json.loads((tmp_path / "out" / "course" / "MATH" / "221.json").read_text())
    assert "2027-sp" not in math["terms"] and math["pattern"]["label"].startswith("Fall only")
    meta = json.loads((tmp_path / "out" / "meta.json").read_text())
    assert meta["next_term"] == "2027-sp" and meta["rmp_status"].startswith("unavailable")
    search = json.loads((tmp_path / "out" / "search.json").read_text())
    assert {"s": "CS", "n": "124"}.items() <= next(c for c in search["courses"] if c["n"] == "124").items()
