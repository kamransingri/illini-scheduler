import json
from datetime import UTC, datetime, timedelta

from lxml import etree

from pipeline import course_explorer, db, export, gpa, instructors, offerings
from pipeline.config import FIXTURES


def test_export_seat_history_and_feeds(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    for term in ("2026-fa", "2027-sp"):
        c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / f"{term}.csv")
        course_explorer.store(conn, term, c, s, "wade-course-catalog", "")
    df = gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv")
    gpa.store(conn, gpa.compute(df))
    instructors.run(conn, df, False, tmp_path / "x.csv", tmp_path / "u.csv", tmp_path / "rmp")
    offerings.run(conn, "2027-sp")
    yesterday = (datetime.now(UTC) - timedelta(days=1)).isoformat(timespec="seconds")
    old = (datetime.now(UTC) - timedelta(days=12)).isoformat(timespec="seconds")
    conn.execute("INSERT INTO availability VALUES ('2027-sp', '71578', 'Open', ?, ?)", (yesterday, yesterday))
    conn.executemany("INSERT INTO seat_events VALUES (?,?,?,?,?,?,?,?)", [
        ("2027-sp", yesterday, "71578", "CS", "124", "AYF", "Closed", "Open"),
        ("2027-sp", old, "71578", "CS", "124", "AYF", "Open", "Closed"),
    ])
    export.run(conn, tmp_path / "out")
    cs = json.loads((tmp_path / "out" / "course" / "CS" / "124.json").read_text())
    ayf = next(s for s in cs["terms"]["2027-sp"]["sections"] if s["crn"] == "71578")
    assert ayf["status_since"] == yesterday
    assert [e["new"] for e in cs["seat_events"]] == ["Open", "Closed"]  # newest first
    recent = json.loads((tmp_path / "out" / "seat-events.json").read_text())
    assert len(recent) == 1 and recent[0]["t"] == "Introduction to Computer Science I"  # only the last week
    feed = etree.fromstring((tmp_path / "out" / "feeds" / "CS" / "124.xml").read_bytes())
    titles = feed.xpath("//item/title/text()")
    assert titles[0] == "CS 124 AYF (CRN 71578) opened: Closed → Open" and "closed" in titles[1]
    assert feed.xpath("//channel/link/text()")[0].endswith("/course/CS/124/")
    assert (tmp_path / "out" / "feeds" / "MATH" / "221.xml").exists()  # every course gets a feed to subscribe to
