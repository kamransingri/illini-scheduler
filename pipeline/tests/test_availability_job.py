import json

import httpx

from pipeline import availability, course_explorer, db
from pipeline.config import FIXTURES

PAGE = (FIXTURES / "course-explorer-web" / "2026-fa_CS124.html").read_bytes()


class FakeClient:
    def __init__(self, codes):
        self.codes = codes  # path suffix -> status code
        self.calls = []

    def get(self, url):
        self.calls.append(url)
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
