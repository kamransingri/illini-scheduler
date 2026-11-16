import json

import httpx

from pipeline import availability, course_explorer, db
from pipeline.config import FIXTURES

PAGE = (FIXTURES / "course-explorer-web" / "2026-fa_CS124.html").read_bytes()


class FakeClient:
    def __init__(self, codes):
        self.codes = codes  # path suffix -> status code
        self.calls = []

    def get(self, url, headers=None):
        self.calls.append(url)
        self.headers = headers
        for suffix, code in self.codes.items():
            if url.endswith(suffix):
                return httpx.Response(code, content=PAGE if code == 200 else b"", request=httpx.Request("GET", url))
        return httpx.Response(404, request=httpx.Request("GET", url))


def test_slow_crawl_saves_and_resumes_oldest_first(tmp_path, monkeypatch):
    monkeypatch.setattr(availability, "AVAIL_DIR", tmp_path)
    sleeps = []
    client = FakeClient({"/CS/124": 200, "/CS/999": 202})
    d = availability.crawl_slow("2026-fa", [("CS", "124"), ("CS", "999"), ("MATH", "1")], deadline=1e12,
                                interval=0, client=client, sleep=sleeps.append)
    assert d["sections"]["76898"][0] == "Closed" and "CS 124" in d["courses"] and "MATH 1" in d["courses"]
    assert "CS 999" not in d["courses"]  # 202 -> left unchecked so the next run tries it first
    assert 15 in sleeps  # backed off after the 202
    saved = json.loads((tmp_path / "2026-fa.json").read_text())
    assert saved["sections"]["74481"][0] == "Open"
    # next run: the never-checked course goes first
    client2 = FakeClient({})
    availability.crawl_slow("2026-fa", [("CS", "124"), ("CS", "999"), ("MATH", "1")], deadline=1e12,
                            interval=0, client=client2, sleep=lambda *_: None)
    assert client2.calls[0].endswith("/CS/999")


def test_slow_crawl_cools_down_after_repeated_pushback(tmp_path, monkeypatch):
    monkeypatch.setattr(availability, "AVAIL_DIR", tmp_path)
    sleeps = []
    courses = [("CS", str(100 + i)) for i in range(12)]
    client = FakeClient({f"/CS/{100 + i}": 202 for i in range(12)})
    availability.crawl_slow("2027-sp", courses, deadline=1e12, interval=0, client=client, sleep=sleeps.append)
    assert 300 in sleeps


def test_apply_files_sets_status_and_time(tmp_path, monkeypatch):
    monkeypatch.setattr(availability, "AVAIL_DIR", tmp_path)
    (tmp_path / "2026-fa.json").write_text(json.dumps(
        {"sections": {"76898": ["Closed", "2026-11-04T08:00:00+00:00"]}, "courses": {}}))
    conn = db.connect(tmp_path / "t.db")
    c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / "2026-fa.csv", {"CS"})
    course_explorer.store(conn, "2026-fa", c, s, "wade-course-catalog", "2026-03-25")
    monkeypatch.setenv("AVAILABILITY_MODE", "file")
    msg = availability.run(conn, ["2026-fa", "2027-sp"])
    assert "2026-fa: 1 of" in msg and "2027-sp: no availability file" in msg
    assert conn.execute("SELECT enrollment_status FROM sections WHERE crn='76898'").fetchone()[0] == "Closed"
    assert conn.execute("SELECT checked_at FROM terms WHERE term='2026-fa'").fetchone()[0].startswith("2026-11-04")


FINALS = (FIXTURES / "course-explorer-web" / "finalexam_2026-fa_MATH221.html").read_bytes()  # real response


def test_final_exam_fragment_parses():
    rows = availability.parse_final_exams(FINALS)
    assert len(rows) == 8
    al1 = [r for r in rows if r["crn"] == "46992"]
    assert {r["type"] for r in al1} == {"Combined", "Conflict"}
    main = next(r for r in al1 if r["type"] == "Combined")
    assert main == {"crn": "46992", "code": "AL1", "date": "2026-12-14", "start": 810, "end": 990,
                    "room": "1320 Digital Computer Laboratory; 1090 Lincoln Hall; 151 Loomis Laboratory",
                    "type": "Combined"}
    none = (FIXTURES / "course-explorer-web" / "finalexam_2026-fa_CS124.html").read_bytes()
    assert availability.parse_final_exams(none) == []  # "No final exam schedule information currently available"


class FinalsClient(FakeClient):
    def get(self, url, headers=None):
        if "/ajax/finalexam/" in url:
            self.calls.append(url)
            self.headers = headers
            return httpx.Response(200, content=FINALS, request=httpx.Request("GET", url))
        return super().get(url, headers)


def test_slow_crawl_reads_finals_weekly_with_the_htmx_header(tmp_path, monkeypatch):
    monkeypatch.setattr(availability, "AVAIL_DIR", tmp_path)
    client = FinalsClient({"/CS/124": 200})
    d = availability.crawl_slow("2026-fa", [("CS", "124")], deadline=1e12, interval=0, client=client,
                                sleep=lambda *_: None)
    assert client.calls == ["https://courses.illinois.edu/schedule/2026/fall/CS/124",
                            "https://courses.illinois.edu/ajax/finalexam/2026/fall/CS/124"]
    assert client.headers["HX-Request"] == "true"
    assert len(d["finals"]["CS 124"]["rows"]) == 8 and "1 final-exam lists" in d["_report"]
    # within a week: the page is read again, the finals aren't
    client2 = FinalsClient({"/CS/124": 200})
    availability.crawl_slow("2026-fa", [("CS", "124")], deadline=1e12, interval=0, client=client2,
                            sleep=lambda *_: None)
    assert not any("/ajax/finalexam/" in c for c in client2.calls)


def test_finals_load_into_the_db_and_export_with_sections(tmp_path, monkeypatch):
    from pipeline import export

    monkeypatch.setattr(availability, "AVAIL_DIR", tmp_path)
    rows = availability.parse_final_exams(FINALS)
    (tmp_path / "2026-fa.json").write_text(json.dumps({
        "sections": {"46992": ["Open", "2026-11-04T08:00:00+00:00"]},
        "finals": {"MATH 221": {"checked": "2026-11-04T08:00:00+00:00", "rows": rows}}}))
    conn = db.connect(tmp_path / "t.db")
    c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / "2026-fa.csv", {"MATH"})
    course_explorer.store(conn, "2026-fa", c, s, "wade-course-catalog", "2026-03-25")
    monkeypatch.setenv("AVAILABILITY_MODE", "file")
    availability.apply_files(conn, ["2026-fa"])
    assert conn.execute("SELECT COUNT(*) FROM final_exams WHERE term='2026-fa'").fetchone()[0] == 8
    export.run(conn, tmp_path / "out")
    doc = json.loads((tmp_path / "out" / "course" / "MATH" / "221.json").read_text())
    al1 = next(x for x in doc["terms"]["2026-fa"]["sections"] if x["crn"] == "46992")
    assert al1["fx"] == [["2026-12-14", 810, 990, "Combined"], ["2026-12-15", 480, 660, "Conflict"]]
