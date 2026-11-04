import warnings

import pytest

from pipeline import db
from pipeline.config import FIXTURES
from pipeline.course_explorer import (
    Meeting,
    Section,
    assign_links,
    extract_prereq,
    parse_catalog_csv,
    parse_course_xml,
    parse_gened,
    parse_index_xml,
    store,
)

CSV = FIXTURES / "course-catalog"
XML = FIXTURES / "course-explorer"
REF = [("2027-sp", "CS", "124"), ("2026-fa", "MATH", "221"), ("2027-sp", "STAT", "107"), ("2027-sp", "RHET", "105")]
LECTURE_TYPES = {"LEC", "LCD", "OLC", "OLD"}


def _course(term, subj, num):
    courses, sections = parse_catalog_csv(CSV / f"{term}.csv", {subj})
    c = next(c for c in courses if c.number == num)
    return c, [s for s in sections if s.number == num]


@pytest.mark.parametrize("term,subj,num", REF)
def test_csv_fixture_parses_without_warnings(term, subj, num):
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        c, secs = _course(term, subj, num)
    assert c.title and secs
    assert all(s.crn.isdigit() for s in secs)
    for s in secs:
        for m in s.meetings:
            assert (m.start is None) == (m.end is None)
            if m.start is not None:
                assert m.start < m.end


@pytest.mark.parametrize("term,subj,num", REF)
def test_xml_fixture_matches_csv(term, subj, num):
    course, secs = parse_course_xml((XML / f"HANDMADE_{term}_{subj}{num}_cascade.xml").read_bytes())
    c2, secs2 = _course(term, subj, num)
    assert (course.term, course.subject, course.number, course.title) == (c2.term, c2.subject, c2.number, c2.title)
    assert course.gened_codes == c2.gened_codes
    key = lambda s: (s.crn, s.section_code, s.type, s.link_group, s.component,  # noqa: E731
                     [(m.start, m.end, m.days, m.building) for m in s.meetings], s.instructors)
    assert sorted(map(key, secs)) == sorted(map(key, secs2))


def test_cs124_has_lecture_and_crns():
    for term in ("2026-fa", "2027-sp"):
        _, secs = _course(term, "CS", "124")
        assert any(s.type in LECTURE_TYPES for s in secs), term
        assert all(s.crn for s in secs)


def test_cs124_spring_links_lecture_with_discussions():
    _, secs = _course("2027-sp", "CS", "124")
    al1 = next(s for s in secs if s.section_code == "AL1")
    ayf = next(s for s in secs if s.section_code == "AYF")
    assert al1.component == "primary" and ayf.component == "DIS"
    assert al1.link_group == ayf.link_group == "A"


def test_stat107_any_lecture_any_lab():
    _, secs = _course("2027-sp", "STAT", "107")
    assert {s.link_group for s in secs} == {"*"}
    assert {s.component for s in secs} == {"primary", "LBD"}


def test_rhet105_every_section_standalone():
    _, secs = _course("2027-sp", "RHET", "105")
    assert {s.component for s in secs} == {"primary"}


def test_multi_meeting_crn_is_one_section():
    _, secs = _course("2026-fa", "CS", "124")
    wwc = [s for s in secs if s.section_code == "WWC"]
    assert len(wwc) == 1 and len(wwc[0].meetings) == 3


def _sec(code, typ, crn):
    return Section("2027-sp", crn, "X", "1", code, "1", "A", "", meetings=[Meeting(typ, typ, 540, 590, 1, "", "", [])])


def test_assign_links_group_rule():
    secs = [_sec("AL1", "LEC", "1"), _sec("AD1", "DIS", "2"), _sec("BL1", "LEC", "3"), _sec("BD1", "DIS", "4")]
    assign_links(secs)
    assert [s.link_group for s in secs] == ["A", "A", "B", "B"]


def test_assign_links_only_secondary_means_standalone():
    secs = [_sec("AB1", "LAB", "1"), _sec("AB2", "LAB", "2")]
    assign_links(secs)
    assert {s.component for s in secs} == {"primary"}


def test_gened_parsing():
    assert parse_gened("Humanities - Hist & Phil, and Cultural Studies - Non-West course.") == ["NW", "HP"]
    assert parse_gened("Quantitative Reasoning II course.") == ["QR2"]
    assert parse_gened("Quantitative Reasoning I course.") == ["QR1"]
    assert parse_gened("") == []


def test_prereq():
    assert extract_prereq("Credit is not given for both. Prerequisite: MATH 112.") == "MATH 112."
    assert extract_prereq("", "No prereq here") == ""


def test_schedule_index():
    subs = parse_index_xml((XML / "HANDMADE_schedule_2027_spring.xml").read_bytes(), "subject")
    assert ("CS", "Computer Science") in subs


def test_store_roundtrip(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    courses, sections = parse_catalog_csv(CSV / "2027-sp.csv")
    n = store(conn, "2027-sp", courses, sections, "wade-course-catalog", "2026-10-30T00:00:00")
    assert n == len(sections) > 50
    assert conn.execute("SELECT COUNT(*) FROM sections WHERE start_time > end_time").fetchone()[0] == 0
    row = conn.execute("SELECT * FROM courses WHERE subject='CS' AND number='124'").fetchone()
    assert row["gened_codes"] == "QR1" and "MATH 112" in row["prereq_text"]


def test_html_entities_decoded():
    import io
    header = ("Year,Term,YearTerm,Subject,Number,Name,Description,Credit Hours,Section Info,Degree Attributes,"
              "Schedule Information,CRN,Section,Status Code,Part of Term,Section Title,Section Credit Hours,"
              "Section Status,Enrollment Status,Type,Type Code,Start Time,End Time,Days of Week,Room,Building,"
              "Instructors")
    row = ('2027,spring,2027-sp,REL,208,Cultures &amp; Literatures,A &amp; B,3 hours.,,,,1,A,A,1,,,A,,Lecture,LEC,'
           '09:00AM,09:50AM,MWF,1,Hall,"X, Y"')
    courses, _ = parse_catalog_csv(io.StringIO(header + "\n" + row + "\n"))
    assert courses[0].title == "Cultures & Literatures" and courses[0].description == "A & B"


def test_api_crawler_retries_caches_and_404(tmp_path):
    import asyncio

    import httpx

    from pipeline.course_explorer import ApiCrawler

    calls = {"n": 0}
    body = (XML / "HANDMADE_2027-sp_CS124_cascade.xml").read_bytes()

    def handler(request):
        calls["n"] += 1
        if "MATH/221" in request.url.path:
            return httpx.Response(404)
        if calls["n"] == 1:
            raise httpx.ConnectError("flaky")
        return httpx.Response(200, content=body)

    async def go():
        crawler = ApiCrawler(cache_dir=tmp_path)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            import pipeline.course_explorer as ce
            orig = ce.asyncio.sleep
            ce.asyncio.sleep = lambda *_: orig(0)  # no real backoff in tests
            try:
                a = await crawler.get(client, "schedule/2027/spring/CS/124.xml?mode=cascade")
                b = await crawler.get(client, "schedule/2027/spring/CS/124.xml?mode=cascade")
                with pytest.raises(FileNotFoundError):
                    await crawler.get(client, "schedule/2027/spring/MATH/221.xml?mode=cascade")
            finally:
                ce.asyncio.sleep = orig
            return a, b

    a, b = asyncio.run(go())
    assert a == b == body
    assert calls["n"] == 3  # 1 failure + 1 success, then cached; plus the 404
    course, secs = parse_course_xml(a)
    assert course.number == "124" and secs
