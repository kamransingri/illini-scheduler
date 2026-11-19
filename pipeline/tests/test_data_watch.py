from datetime import date

import httpx
import pytest

from pipeline import data_watch as dw
from pipeline.config import ROOT

TODAY = date(2027, 1, 10)


def meta(**kw):
    m = {
        "built_at": "2027-01-09T09:30:00+00:00",
        "current_term": "2026-fa",
        "next_term": "2027-sp",
        "terms": {
            "2026-fa": {"checked_at": "2027-01-09T15:00:00+00:00"},
            "2027-sp": {"checked_at": "2027-01-09T14:00:00+00:00"},
        },
        "gpa": {"window": ["2015-fa", "2026-su"], "snapshot": "2026-10-29T16:14:44-05:00"},
        "geneds_snapshot": "2026-10-30T01:54:53-05:00",
        "rmp_status": "ok",
    }
    m.update(kw)
    return m


@pytest.mark.parametrize("newest,current,n", [
    ("2026-su", "2026-fa", 0), ("2026-su", "2027-sp", 1), ("2026-su", "2027-fa", 3), ("2026-fa", "2026-fa", 0),
])
def test_terms_behind(newest, current, n):
    assert dw.terms_behind(newest, current) == n


def test_academic_year_starts_in_august():
    assert dw.academic_year(date(2026, 11, 19)) == "2026-2027"
    assert dw.academic_year(date(2027, 7, 31)) == "2026-2027"
    assert dw.academic_year(date(2027, 8, 1)) == "2027-2028"


def test_gpa_one_semester_behind_is_normal_for_a_while_two_is_not():
    assert dw.gpa_row(meta(), None, TODAY).status == dw.OK  # Summer 2026 with Fall 2026 still the current term
    spring = meta(current_term="2027-sp", next_term="2027-fa")
    row = dw.gpa_row(spring, None, date(2027, 4, 10))
    assert row.status == dw.WAITING and "one semester behind" in row.note
    late = dw.gpa_row(spring, None, date(2027, 8, 10))  # the file is 285 days old and Fall 2026 is still missing
    assert late.status == dw.CHECK
    fall = dw.gpa_row(meta(current_term="2027-fa", next_term="2028-sp"), None, date(2027, 10, 10))
    assert fall.status == dw.CHECK and fall.note.startswith("3 semesters behind Fall 2027")


def test_gpa_file_wade_changed_that_the_site_does_not_have():
    row = dw.gpa_row(meta(), "2027-01-05T12:00:00Z", TODAY)
    assert row.status == dw.CHECK and "2027-01-05" in row.note and "2026-10-29" in row.note
    assert dw.gpa_row(meta(), "2026-10-29T21:14:44Z", TODAY).status == dw.OK  # the same commit, another time zone


def test_a_wade_file_is_judged_by_when_it_last_changed():
    assert dw.wade_file_row("TRE", "nightly", "2026-06-01T00:00:00Z", TODAY, 400).status == dw.OK
    old = dw.wade_file_row("TRE", "nightly", "2025-10-08T00:00:00Z", TODAY, 400)
    assert old.status == dw.CHECK and "459 days" in old.note
    assert dw.wade_file_row("TRE", "nightly", None, TODAY, 400).now == "date unknown"


def test_yearly_tables():
    assert dw.yearly_row("AP", "", ["2025-2026", "2026-2027"], TODAY).status == dw.OK
    spring = dw.yearly_row("AP", "", ["2026-2027"], date(2027, 5, 1))
    assert spring.status == dw.WAITING and "2027-2028" in spring.note
    assert dw.yearly_row("AP", "", ["2026-2027"], date(2027, 9, 1)).status == dw.CHECK
    assert dw.yearly_row("AP", "", [], TODAY).status == dw.CHECK


def test_term_dates():
    ts = '''export const TERM_DATES = {
  "2026-fa": {
    start: "2026-08-24",
    breaks: [
      ["2026-09-07", "2026-09-07", "Labor Day"],
    ],
  },
  "2027-sp": {
    start: "2027-01-19",
    estimated: true,
  },
};
'''
    row = dw.term_dates_row(ts, meta())
    assert row.status == dw.WAITING and row.note.startswith("Spring 2027 dates are estimated")
    row = dw.term_dates_row(ts, meta(current_term="2027-sp", next_term="2027-fa"))
    assert row.status == dw.CHECK and row.note == "no dates for Fall 2027"
    assert dw.term_dates_row(ts.replace("    estimated: true,\n", ""), meta()).status == dw.OK


def test_the_repo_files_are_read():
    rows = {r.source: r for r in dw.repo_rows(ROOT, meta(), TODAY)}
    assert set(rows) == {"AP credit", "IB credit", "Degree requirements", "Term dates (web/lib/terms.ts)"}
    assert "programs" in rows["Degree requirements"].now and "checked by hand" in rows["Degree requirements"].now


def fake_client(api_status=200, changed="2026-10-29T21:14:44Z"):
    seen = []

    def handler(req):
        seen.append(req)
        if req.url.host == "kamransingri.github.io":
            return httpx.Response(200, json=meta())
        if api_status != 200:
            return httpx.Response(api_status, json={"message": "rate limited"})
        return httpx.Response(200, json=[{"commit": {"committer": {"date": changed}}}])

    c = httpx.Client(transport=httpx.MockTransport(handler))
    c.seen = seen  # type: ignore[attr-defined]
    return c


def test_collect_and_the_issue():
    c = fake_client()
    rows = dw.collect(c, ROOT, TODAY, token="secret")
    assert [r.source for r in rows][:3] == ["Site build", "Course Explorer sections and seats", "Wade's GPA dataset"]
    # the token only goes to the GitHub API
    assert all(("authorization" in r.headers) == (r.url.host == "api.github.com") for r in c.seen)
    body = dw.issue_body(rows, TODAY)
    assert dw.issue_title(TODAY) == "Data check: January 2027"
    assert "| Wade's GPA dataset | downloaded nightly; a new semester appears once Wade publishes it |" in body
    assert "| through Summer 2026 (file changed 2026-10-29) | OK |" in body
    assert "- [ ] Spot-check three courses against Course Explorer" in body
    assert ("### Needs a look" in body) == any(r.status != dw.OK for r in rows)


def test_github_api_failure_is_not_fatal(capsys):
    rows = dw.collect(fake_client(api_status=403), ROOT, TODAY)
    by = {r.source: r for r in rows}
    assert by["Wade's GPA dataset"].status == dw.OK  # judged from the live site alone
    assert by["Wade's gen-ed list"].now == "file changed 2026-10-30"  # falls back to the live site's snapshot
    assert by["Wade's Teachers Ranked as Excellent list"].status == dw.CHECK
    assert "couldn't read when" in capsys.readouterr().err


def test_nothing_flagged():
    rows = [dw.Row("A", "nightly", "fine", dw.OK)]
    assert "Nothing is flagged." in dw.issue_body(rows, TODAY)
