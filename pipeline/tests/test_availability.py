import httpx

from pipeline import availability, course_explorer, db
from pipeline.config import FIXTURES

PAGE = (FIXTURES / "course-explorer-web" / "2026-fa_CS124.html").read_bytes()


def test_parse_real_page():
    d = availability.parse_availability(PAGE)
    assert len(d) == 17
    assert d["74481"] == "Open"          # QBA lab-discussion
    assert d["76898"] == "Closed"        # WWC
    assert set(d.values()) <= {"Open", "Closed", "CrossListOpen (Restricted)"}


def test_parse_ignores_rows_without_crn():
    assert availability.parse_availability("<table><tr><td><dt>Availability:</dt><dd>Open</dd></td></tr></table>") == {}


def test_run_updates_sections_and_checked_time(tmp_path, monkeypatch):
    conn = db.connect(tmp_path / "t.db")
    c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / "2026-fa.csv", {"CS"})
    course_explorer.store(conn, "2026-fa", c, s, "cis-api", "2026-01-01T00:00:00+00:00")
    conn.execute("UPDATE sections SET enrollment_status=''")

    def handler(request):
        if request.url.path.endswith("/CS/124"):
            return httpx.Response(200, content=PAGE)
        return httpx.Response(404)

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(availability, "RAW", tmp_path)
    monkeypatch.setenv("AVAILABILITY_MODE", "crawl")
    msg = availability.run(conn, ["2026-fa"])
    assert "17 sections" in msg
    assert conn.execute("SELECT enrollment_status FROM sections WHERE crn='76898'").fetchone()[0] == "Closed"
    row = conn.execute("SELECT checked_at, source FROM terms WHERE term='2026-fa'").fetchone()
    assert row[0] > "2026-01-01" and "web availability" in row[1]


def test_run_never_raises(tmp_path, monkeypatch):
    conn = db.connect(tmp_path / "t.db")
    c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / "2026-fa.csv", {"CS"})
    course_explorer.store(conn, "2026-fa", c, s, "cis-api", "")

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(availability, "_fetch_all", boom)
    monkeypatch.setenv("AVAILABILITY_MODE", "crawl")
    assert "unavailable" in availability.run(conn, ["2026-fa"])
