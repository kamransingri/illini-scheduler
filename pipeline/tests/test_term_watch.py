import httpx
import pytest

from pipeline import term_watch
from pipeline.config import CIS_BASE

NS = 'xmlns:ns2="http://rest.cis.illinois.edu"'
RealClient = httpx.Client  # main() is tested with httpx.Client patched to this fake


class FakeClient(RealClient):
    calls: list[str]


def index(years):
    items = "".join(f'<calendarYear id="{y}" href="{CIS_BASE}/schedule/{y}.xml">{y}</calendarYear>' for y in years)
    return f'<ns2:schedule {NS}><calendarYears>{items}</calendarYears></ns2:schedule>'.encode()


def year(y, seasons):
    items = "".join(f'<term id="1{y}x">{s} {y}</term>' for s in seasons)
    return f'<ns2:calendarYear {NS} year="{y}"><terms>{items}</terms></ns2:calendarYear>'.encode()


def client(pages, codes=None) -> FakeClient:
    calls: list[str] = []

    def handler(req):
        calls.append(str(req.url))
        url = str(req.url)
        code = (codes or {}).get(url, 200 if url in pages else 404)
        return httpx.Response(code, content=pages.get(url, b"") if code == 200 else b"")

    c = FakeClient(transport=httpx.MockTransport(handler))
    c.calls = calls
    return c


def term_page(subjects):
    items = "".join(f'<subject id="{s}">{s}</subject>' for s in subjects)
    return f'<ns2:term {NS}><subjects>{items}</subjects></ns2:term>'.encode()


def pages_for(spring_only_2027=True, fall_published=True):
    """Course Explorer as in November 2026: Summer and Fall 2027 in the index, their pages 404 until published."""
    pages = {
        f"{CIS_BASE}/schedule.xml": index([2004, 2005, 2025, 2026, 2027]),
        f"{CIS_BASE}/schedule/2026.xml": year(2026, ["Spring", "Summer", "Fall"]),
        f"{CIS_BASE}/schedule/2027.xml": year(2027, ["Spring"] if spring_only_2027 else ["Spring", "Summer", "Fall"]),
    }
    if fall_published:
        pages[f"{CIS_BASE}/schedule/2027/fall.xml"] = term_page(["CS", "MATH"])
    return pages


def test_reads_only_the_two_newest_years():
    c = client(pages_for())
    assert term_watch.listed_terms(c, wait=0) == ["2026-sp", "2026-su", "2026-fa", "2027-sp"]
    assert len(c.calls) == 3  # the index and two years, never the 2004 one


def test_nothing_newer_while_the_next_term_is_the_newest():
    assert term_watch.newer_than(term_watch.listed_terms(client(pages_for()), wait=0), "2027-sp") == []


def test_listed_but_unpublished_terms_dont_count():
    """November 2026: the index already lists Summer and Fall 2027, but their pages are 404."""
    new, listed = term_watch.new_terms(client(pages_for(False, fall_published=False)), "2027-sp", wait=0)
    assert listed == ["2027-su", "2027-fa"] and new == []


def test_fall_published_asks_for_the_rollover():
    new, _ = term_watch.new_terms(client(pages_for(False)), "2027-sp", wait=0)
    assert new == ["2027-fa"]  # summer still unpublished
    assert term_watch.issue_title(new) == "Course Explorer lists a new term: Fall 2027"
    body = term_watch.issue_body(new, "2026-fa", "2027-sp")
    assert 'CURRENT_TERM = "2027-sp"' in body and 'NEXT_TERM = "2027-fa"' in body
    assert "web/lib/terms.ts" in body and "tools.release bump minor" in body and "#33" in body


def test_summer_alone_says_there_is_nothing_to_roll_over_yet():
    body = term_watch.issue_body(["2027-su"], "2026-fa", "2027-sp")
    assert "Summer 2027" in body and "nothing to roll over yet" in body and "CURRENT_TERM" not in body
    assert 'add `"2027-su"` to `HISTORY_TERMS`' in body and "Summer courses page" in body  # #35
    # a later fall gets a different title, so it opens its own issue even while the summer one is open
    assert term_watch.issue_title(["2027-su"]) != term_watch.issue_title(["2027-su", "2027-fa"])


def test_retries_a_202_then_gives_up():
    pages = pages_for()
    c = client(pages, {f"{CIS_BASE}/schedule.xml": 202})
    with pytest.raises(RuntimeError, match="HTTP 202 after 3 tries"):
        term_watch.listed_terms(c, wait=0)
    assert len(c.calls) == 3


def test_main_exit_codes(tmp_path, monkeypatch):
    for published, code in ((False, 0), (True, term_watch.CHANGED)):
        pages = pages_for(False, fall_published=published)
        monkeypatch.setattr(term_watch.httpx, "Client", lambda *a, pages=pages, **k: client(pages))
        issue, title = tmp_path / f"i{code}.md", tmp_path / f"t{code}.txt"
        assert term_watch.main(["--issue", str(issue), "--title", str(title)]) == code
        assert issue.exists() == (code == term_watch.CHANGED)
        if code:
            assert title.read_text(encoding="utf-8") == "Course Explorer lists a new term: Fall 2027"
