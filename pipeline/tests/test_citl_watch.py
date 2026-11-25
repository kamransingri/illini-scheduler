import httpx
import pytest

from pipeline import citl_watch as cw

STATIC = "https://citl.illinois.edu/advanced-placement-ap-credit-2025"
API = "https://api.example"
# The shapes of CITL's two static layouts: a table per exam (2025-2026) and paragraphs per exam (2024-2025).
PAGE = """<html><body><nav><a>Menu</a></nav><main>
<div class="card"><div class="card-header">
<div class="accordion-title" tabindex="0"> African American Studies </div></div>
<div class="card-body"><div class="tex2jax_process"><table><thead>
<tr><th><h4>Score</h4></th><th><h4>Course Credited</h4></th></tr></thead>
<tbody><tr><td>3-5</td><td>AFRO 100</td></tr></tbody></table><p><br>&nbsp;</p></div></div></div>
<script>console.log("accordion title listener")</script>
<div class="card"><div class="card-header"><div class="accordion-title"> AP Precalculus </div></div>
<div class="card-body"><p><strong>Score</strong>: 3-5</p><hr>
<p><strong>Course Credited</strong>: MATH 1--</p></div></div>
</main><footer>&copy; 2026</footer></body></html>"""


def test_page_lines_reads_exam_names_tables_and_paragraphs():
    assert cw.page_lines(PAGE) == ["## African American Studies", "Score | Course Credited", "3-5 | AFRO 100",
                                   "## AP Precalculus", "Score: 3-5", "Course Credited: MATH 1--"]


def test_a_cosmetic_change_is_not_a_change_but_a_changed_row_is():
    cosmetic = (PAGE.replace("<a>Menu</a>", "<a>New menu</a>").replace('tabindex="0"', 'tabindex="1" data-x="y"')
                .replace("&copy; 2026", "&copy; 2027").replace('console.log("accordion title listener")', "track()")
                .replace("<td>3-5</td>", "<td>\n  3-5 </td>"))
    assert cw.page_lines(cosmetic) == cw.page_lines(PAGE)
    assert cw.page_lines(PAGE.replace("AFRO 100", "AFRO 101")) != cw.page_lines(PAGE)


def test_api_lines_keep_the_ap_rows_in_a_stable_order():
    entries = [
        {"Exam Type": "AP", "Test Name": "CHEMISTRY", "Score": "5", "Course Credit": "CHEM 102, CHEM 104",
         "Credit Earned": "6"},
        {"Exam Type": "ACT", "Test Name": "ACT ENGLISH", "Score": "20-34"},
        {"Exam Type": "AP", "Test Name": "BIOLOGY", "Score": "5", "Course Credit": "IB 150",
         "Placement Message": " Take  IB 151 "},
    ]
    lines = cw.api_lines({"entries": entries})
    assert lines == ["BIOLOGY |  | 5 | IB 150 |  | Take IB 151 | ", "CHEMISTRY |  | 5 | CHEM 102, CHEM 104 | 6 |  | "]
    assert cw.api_lines({"entries": entries[::-1]}) == lines


@pytest.fixture
def citl(tmp_path):
    (tmp_path / "2025-2026.yaml").write_text(f"year: 2025-2026\nsource: {STATIC}\n", encoding="utf-8")
    (tmp_path / "2026-2027.yaml").write_text(f"year: 2026-2027\nsource: {cw.CUTOFF_PAGE}\n", encoding="utf-8")
    state = {"page": PAGE, "years": ["2026-2027", "2025-2026"],
             "entries": [{"Exam Type": "AP", "Test Name": "BIOLOGY", "Score": "5", "Course Credit": "IB 150"}]}

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == cw.CUTOFF_PAGE:
            return httpx.Response(200, text=f"<script>window.PNP_API_BASE_URL = '{API}';</script>")
        if url == f"{API}/api/public/years":
            return httpx.Response(200, json=[{"id": y} for y in state["years"]])
        if url == f"{API}/api/public/years/2026-2027":
            return httpx.Response(200, json={"entries": state["entries"]})
        if url == STATIC:
            return httpx.Response(200, text=state["page"])
        return httpx.Response(404)

    return tmp_path, state, httpx.Client(transport=httpx.MockTransport(handler))


def test_check_reports_changed_rows_and_new_years(citl):
    folder, state, client = citl
    first = cw.check(client, folder)
    assert first.no_snapshot == ["2025-2026", "2026-2027"] and first.anything
    cw.save_snapshots(first, folder)
    assert not cw.check(client, folder).anything

    state["page"] = PAGE.replace("AFRO 100", "AFRO 101")
    state["entries"][0]["Score"] = "4-5"
    state["years"].insert(0, "2027-2028")
    rep = cw.check(client, folder)
    assert rep.changed["2025-2026"] == ["@@ -3 +3 @@", "-3-5 | AFRO 100", "+3-5 | AFRO 101"]
    assert "+BIOLOGY |  | 4-5 | IB 150 |  |  | " in rep.changed["2026-2027"]
    assert rep.new_years == ["2027-2028"]
    body = cw.issue_body(rep)
    assert "New year in CITL's cutoff tool: 2027-2028" in body and "```diff" in body and "--update" in body


def test_an_empty_read_is_an_error_not_a_quiet_pass(citl):
    folder, state, client = citl
    state["page"] = "<main><p>Page moved</p></main>"
    with pytest.raises(RuntimeError, match="nothing read"):
        cw.check(client, folder)


def test_main_exits_10_and_writes_the_issue_when_something_changed(tmp_path, monkeypatch):
    rep = cw.Report(lines={"2026-2027": ["x"]}, new_years=["2027-2028"])
    monkeypatch.setattr(cw, "check", lambda client, d, t: rep if t == "AP" else cw.Report(t, d))
    out = tmp_path / "issue.md"
    assert cw.main(["--issue", str(out)]) == cw.CHANGED
    assert "2027-2028" in out.read_text(encoding="utf-8")
    monkeypatch.setattr(cw, "check", lambda client, d, t: cw.Report(t, d, lines={"2026-2027": ["x"]}))
    assert cw.main([]) == 0


def test_ib_rows_are_checked_on_their_own_and_older_missing_years_are_not_new(citl):
    folder, state, client = citl
    (folder / "2025-2026.yaml").unlink()  # IB has no 2025-2026 file on purpose (the tool's rows have no level)
    state["entries"].append({"Exam Type": "IB", "Test Name": "ECONOMICS", "Level": "HL", "Score": "4, 5, 6, 7",
                             "Course Credit": "ECON 102, 103", "Credit Earned": "3 + 3 = 6"})
    rep = cw.check(client, folder, "IB")
    assert rep.lines["2026-2027"] == ["ECONOMICS | HL | 4, 5, 6, 7 | ECON 102, 103 | 3 + 3 = 6 |  | "]
    assert rep.new_years == []  # 2025-2026 is older than the newest file
    state["years"].insert(0, "2027-2028")
    rep = cw.check(client, folder, "IB")
    assert rep.new_years == ["2027-2028"]
    assert f"`data/{folder.name}/2027-2028.yaml`" in cw.issue_body([rep]) and "(IB)" in cw.issue_body([rep])


def test_act_and_sat_rows_and_placement_pages_are_watched_together(citl, monkeypatch):
    folder, state, client = citl
    (folder / "2025-2026.yaml").unlink()
    page = ("<main><h1>Chemistry Placement</h1><p>SAT Math scores of 590 or below</p><script>x</script></main>"
            "<p>footer</p>")
    monkeypatch.setitem(cw.PAGES, folder, {"chemistry-placement": STATIC})
    state["page"] = page
    state["entries"] += [
        {"Exam Type": "SAT", "Test Name": "SAT ERBW", "Score": "740-800", "Course Credit": "RHET 105"},
        {"Exam Type": "ACT", "Test Name": "ACT ENGLISH", "Score": "35-36", "Course Credit": "RHET 105"},
    ]
    first = cw.check(client, folder, "ACT/SAT")
    assert first.lines["2026-2027"] == ["ACT | ACT ENGLISH |  | 35-36 | RHET 105 |  |  | ",
                                        "SAT | SAT ERBW |  | 740-800 | RHET 105 |  |  | "]
    assert first.lines["chemistry-placement"] == ["Chemistry Placement", "SAT Math scores of 590 or below"]
    cw.save_snapshots(first, folder)
    assert not cw.check(client, folder, "ACT/SAT").anything  # unchanged data isn't reported

    state["page"] = page.replace("590", "600")
    state["entries"][-1]["Score"] = "34-36"
    state["years"].insert(0, "2027-2028")
    rep = cw.check(client, folder, "ACT/SAT")
    assert set(rep.changed) == {"2026-2027", "chemistry-placement"} and rep.new_years == ["2027-2028"]
    assert "CITL's AP, IB, SAT or ACT tables" in cw.issue_body([rep])
