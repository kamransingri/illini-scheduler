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
