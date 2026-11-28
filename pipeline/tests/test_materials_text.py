"""Course materials 3 (#61). Section texts are copied from Course Explorer (Fall 2026 and Spring 2027); the pages are
the real ones in fixtures/course-pages/ (`python -m pipeline.materials_text --save-fixtures`)."""

import json
import sqlite3

import pytest

from pipeline import db
from pipeline import materials_text as mt
from pipeline.config import FIXTURES

PAGES = FIXTURES / "course-pages"


def items(text, source=mt.CE_TEXT):
    return {(i.kind, i.title, i.need, i.price) for i in mt.extract(text, source)}


def page(name, course):
    lines = mt.page_lines((PAGES / name).read_text(encoding="utf-8"), course)
    assert lines is not None
    return mt.extract(lines, mt.PAGE, "https://courses.grainger.illinois.edu/x")


@pytest.mark.parametrize("text,want", [
    # MATH 234 46993
    ("Students are required to take a Placement Exam prior to taking this course. Additional information can be found "
     "here: http://math.illinois.edu/ALEKS Day1Access course materials cost $89.40. For more information see "
     "https://go.illinois.edu/Day1Access.",
     {("day1access", "Day1Access course materials", None, "$89.40")}),
    # GEOL 118 30379: two prices
    ("Day1Access course materials cost $44.58 and $64.48. For more information see https://go.illinois.edu/Day1Access.",
     {("day1access", "Day1Access course materials", None, "$44.58 and $64.48")}),
    # CHEM 223 31611
    ("Students registered for CHEM 223 will be charged a lab fee of $40.00. Restrictions will be removed on June 1st "
     "at 10:00 a.m.", {("fee", "Lab fee", "required", "$40.00")}),
    # FSHN 302 52117
    ("The $30 class materials fee will be charged directly to your tuition bill. /// Open to Food Science Minors not "
     "majoring in FSHN.", {("fee", "Class materials fee", "required", "$30")}),
    # NRES 403 65583, ME 297 67616, NRES 455: no textbook
    ("Wireless internet is not recommended. This course has no required textbook.",
     {("textbook", "Textbook", "none", None)}),
    ("Designation: Free elective credit for Engineering Mechanics and Mechanical Engineering. Textbook: no required "
     "textbook", {("textbook", "Textbook", "none", None)}),
    ("No textbook is required.", {("textbook", "Textbook", "none", None)}),
    # HK 264 79112: a paid e-textbook code
    ("The students pay for a keycode at Illini Union Bookstore which allows them access to the e-textbook ($129.95).",
     {("access-code", "e-textbook access code", "required", "$129.95")}),
    # HK 109 79043
    ("This course will require an additional fee to access the Cengage online resources (including the e-textbook) "
     "necessary to complete all module tasks.", {("access-code", "Cengage online resources", "required", None)}),
    # a paid platform, named as the homework (exam_format's test sentence)
    ("WebAssign homework is due every Friday.", {("access-code", "WebAssign", None, None)}),
    # a free platform: CS 357 53280
    ("Students registered in the in-person section will complete all assessments online via PrairieLearn.",
     {("platform", "PrairieLearn", None, "free")}),
    # CHEM 312 32624
    ("Molecular Model Kit Required for this class, you can find it here: Swpeet 252 Pcs Molecular Model Kit",
     {("lab-kit", "Molecular model kit", "required", None)}),
    # CS 128 74509, STAT 107 71667, BDI 199
    ("This section will require a laptop.", {("laptop", "Laptop", "required", None)}),
    ("Students in this section are highly encouraged to bring their own laptops to class.",
     {("laptop", "Laptop", "recommended", None)}),
    ("A laptop with at least 8 GB of RAM is required.", {("laptop", "Laptop", "required", None)}),
])
def test_section_text(text, want):
    assert items(text) == want


@pytest.mark.parametrize("text", [
    # the ALEKS placement test is not a purchase (MATH 220 COURSE, MATH 221 46992)
    "Prerequisite: An adequate ALEKS placement score as described at http://math.illinois.edu/ALEKS/.",
    "Students are required to take a Placement Exam prior to taking this course. Additional information can be found "
    "here: http://math.illinois.edu/ALEKS",
    # Day1Access named without a price, a fee that isn't for materials, a textbook only talked about
    "For more information see https://go.illinois.edu/Day1Access.",
    "This course will have a $60 field trip fee.",
    "Textbooks may be purchased at the Illini Union Bookstore online at http://www.uofibookstore.uiuc.edu/.",
    "Have you ever wondered whether the textbook algorithms you have learned could be improved?",
    "Students who do not have a working laptop may reach out to the Technology Loaner program.",
    "This course explores the ecology of grasslands from Illinois prairies to grassland ecosystems around the world.",
    "Understand the process of how to ship a real game while mastering the full-cycle game development process.",
    "Students connect field experiences to current theories and practices.",
])
def test_nothing_without_support(text):
    assert items(text) == set()


def test_iclicker_remote_only_page():
    # PHYS 100: "The iClicker cloud app is not compatible with our course. You need a physical iClicker remote."
    got = page("PHYS100-iclicker.html", "PHYS 100")
    clickers = [i for i in got if i.kind.startswith("iclicker")]
    assert [(i.kind, i.need) for i in clickers] == [("iclicker-remote", "required")]
    assert "not compatible" in clickers[0].quote


def test_iclicker_remote_or_app_page():
    got = page("PHYS102-iclicker.html", "PHYS 102")
    assert {(i.kind, i.need) for i in got if i.kind.startswith("iclicker")} == {
        ("iclicker-remote", "choose-one"), ("iclicker-subscription", "choose-one")}


def test_headings_set_need_on_a_materials_page():
    got = {(i.kind, i.title, i.need, i.price) for i in page("PHYS211-required-materials.html", "PHYS 211")}
    assert ("iclicker-remote", "iClicker remote", "required", None) in got  # "but not the phone app or iclicker cloud"
    assert ("access-code", "smartPhysics", "required", None) in got  # "pay for access by purchasing a code"
    assert ("lab-kit", "IOLab device", "required", None) in got
    assert ("calculator", "Calculator", "required", None) in got
    assert ("textbook", "Textbook", "optional", None) in got  # Tipler, under "Optional Materials"
    assert ("textbook", "Textbook", "optional", "free") in got  # OpenStax: "This is free"
    assert not any(i[0] == "laptop" for i in got)  # "Students who do not have a working laptop may reach out..."


def test_a_page_that_isnt_the_course_adds_nothing():
    html = (PAGES / "ME200-iclicker.html").read_text(encoding="utf-8")
    assert mt.page_lines(html, "ME 200") is None


def test_iclicker_text_rules():
    def one(t):
        return {(i.kind, i.need) for i in mt.extract(t, mt.CE_TEXT)}
    assert one("iClicker Remote required; the app is not accepted.") == {("iclicker-remote", "required")}
    assert one("You may choose whether you will use a physical iClicker remote or the iClicker Cloud app.") == {
        ("iclicker-remote", "choose-one"), ("iclicker-subscription", "choose-one")}
    assert one("This course requires an iClicker Cloud subscription; remotes are not accepted.") == {
        ("iclicker-subscription", "required")}
    assert one("You can use either the older iClicker+ or the newer iClicker 2.") == {("iclicker", None)}


def test_quotes_are_short_and_carry_the_match():
    text = "x " * 120 + "Students registered for CHEM 203 will be charged a lab fee of $40.00. " + "y " * 120
    (it,) = mt.extract(text, mt.CE_TEXT)
    assert len(it.quote) <= mt.QUOTE_LEN + 2 and "lab fee" in it.quote


def test_term_slug():
    assert mt.term_slug("2026-fa") == "fa2026" and mt.term_slug("2027-sp") == "sp2027"


def test_course_items_name_sections_only_when_they_differ():
    day1 = "Day1Access course materials cost $48.21. For more information see https://go.illinois.edu/Day1Access."
    out = mt.course_items("2026-fa", "", [("1", day1), ("2", day1)], "2026-11-16")
    assert len(out) == 1 and "crns" not in out[0] and out[0]["read_on"] == "2026-11-16"
    out = mt.course_items("2026-fa", "", [("1", day1), ("2", "Lecture.")], "2026-11-16")
    assert out[0]["crns"] == ["1"]


class FakeResponse:
    def __init__(self, status, text=""):
        self.status_code, self.text = status, text


class FakeClient:
    def __init__(self, pages):
        self.pages, self.asked = pages, []

    def get(self, url):
        self.asked.append(url)
        return FakeResponse(200, self.pages[url]) if url in self.pages else FakeResponse(404)


def test_fetcher_respects_robots_and_caches(tmp_path):
    html = (PAGES / "PHYS102-iclicker.html").read_text(encoding="utf-8")
    ok = "https://courses.grainger.illinois.edu/PHYS102/fa2026/iclicker.html"
    blocked = "https://courses.grainger.illinois.edu/PHYS102/fa2026/private/x.html"
    client = FakeClient({"https://courses.grainger.illinois.edu/robots.txt": "User-agent: *\nDisallow: /*/private/\n"
                                                                             "Disallow: /PHYS102/fa2026/private/\n",
                         ok: html})
    f = mt.Fetcher(cache=tmp_path, client=client, delay=0)
    assert (f.get(ok) or ("",))[0] == html
    assert f.get(blocked) is None
    assert f.get("https://example.com/PHYS102.html") is None  # only *.illinois.edu
    assert (f.get(ok) or ("",))[0] == html  # second time from the cache
    assert client.asked.count(ok) == 1 and blocked not in client.asked


def test_run_writes_each_course_term(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    conn.execute("INSERT INTO terms VALUES ('2026-fa', 2026, 'fall', 'Fall 2026', 'cis-api', '2026-11-16T10:00:00')")
    conn.execute("INSERT INTO courses (term, subject, number, section_info_text) VALUES "
                 "('2026-fa', 'NRES', '403', 'This course has no required textbook.')")
    conn.execute("INSERT INTO sections (term, crn, subject, number, section_text) VALUES "
                 "('2026-fa', '30379', 'GEOL', '118', 'Day1Access course materials cost $44.58 and $64.48.')")
    conn.execute("INSERT INTO sections (term, crn, subject, number, section_text) VALUES "
                 "('2026-fa', '10000', 'CS', '124', 'Lecture.')")
    html = (PAGES / "PHYS102-iclicker.html").read_text(encoding="utf-8")
    url = "https://courses.grainger.illinois.edu/PHYS102/fa2026/iclicker.html"
    client = FakeClient({"https://courses.grainger.illinois.edu/robots.txt": "", url: html})
    pages = [("PHYS", "102", "https://courses.grainger.illinois.edu/PHYS102/{term}/iclicker.html")]
    mt.run(conn, ["2026-fa"], mt.Fetcher(cache=tmp_path / "c", client=client, delay=0), pages)
    rows = {(r[1], r[2]): json.loads(r[3]) for r in conn.execute("SELECT * FROM materials")}
    assert set(rows) == {("NRES", "403"), ("GEOL", "118"), ("PHYS", "102")}
    assert rows[("NRES", "403")][0]["source"] == mt.CE_INFO
    assert {i["kind"] for i in rows[("PHYS", "102")]} == {"iclicker-remote", "iclicker-subscription"}
    assert all(i["url"] == url for i in rows[("PHYS", "102")])


def test_course_list_keeps_each_item_once():
    generic = {"kind": "iclicker", "title": "iClicker", "need": "required", "quote": "iClicker"}
    remote = {"kind": "iclicker-remote", "title": "iClicker remote", "need": "required", "quote": "a remote"}
    assert mt.drop_generic([generic, remote]) == [remote]  # another page says which option
    assert mt.drop_generic([generic, {**generic, "quote": "requires the use of I>Clickers"}]) == [generic]
    books = [{"kind": "textbook", "title": "Textbook", "need": "optional", "quote": q} for q in ("Tipler", "OpenStax")]
    assert mt.drop_generic(books) == books


def test_course_pages_list_is_illinois_only():
    for _subj, _num, url in mt.load_pages():
        assert url.startswith("https://") and ".illinois.edu/" in url and "{term}" in url


def test_campus_notes_are_kept_word_for_word():
    # copied from the campus guide; a change here needs the guide checked again
    assert mt.ICLICKER_GUIDE == "https://answers.illinois.edu/120820"
    assert len(mt.ICLICKER_NOTES) == 5 and all(n.endswith(".") for n in mt.ICLICKER_NOTES)


def test_schema_has_the_table():
    conn = db.connect(":memory:")
    assert "materials" in {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert isinstance(conn, sqlite3.Connection)
