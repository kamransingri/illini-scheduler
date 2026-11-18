import yaml

from pipeline import catalog_import
from pipeline.config import FIXTURES
from pipeline.degrees import validate

ACCY = "https://catalog.illinois.edu/undergraduate/bus/accountancy-bs/"
CS = "https://catalog.illinois.edu/undergraduate/engineering/computer-science-bs/"


def parse(name, url):
    doc = catalog_import.parse_program((FIXTURES / "catalog" / f"{name}.html").read_bytes(), url, "2026-11-16")
    validate(yaml.safe_load(yaml.safe_dump(doc)), doc["id"])  # every generated file must pass the schema
    return doc


def test_program_header_and_campus_gened_table():
    d = parse("accountancy-bs", ACCY)
    assert (d["id"], d["program"], d["college"], d["catalog_year"]) == (
        "accountancy-bs", "Accountancy, BS", "Gies College of Business", "2026-2027")
    assert d["total_hours"] == 124 and d["generated"] == "2026-11-16"
    gen = {g["id"]: g for g in d["groups"] if g.get("kind") == "gened"}
    assert set(gen) >= {"comp1", "acp", "hum", "nat", "sbs", "cs-nw", "cs-us", "cs-wcc", "qr", "language"}
    assert gen["sbs"]["notes"] == ["fulfilled by ECON 102 and ECON 103"]
    assert gen["qr"]["min_from"] == {"gened:QR1": 1} and gen["language"]["rule"] == "manual"
    # the page's own sentence lets program courses count as gen-eds
    assert any(r.get("between") == ["program", "gened"] for r in d["double_counting"])


def test_required_lists_pairs_and_select_one_segments():
    groups = [g for g in parse("accountancy-bs", ACCY)["groups"] if g.get("kind") != "gened"]
    core = next(g for g in groups if g["name"] == "Business Core Requirements")
    assert core["rule"] == "all" and "ACCY 201 + ACCY 202" in core["courses"]  # "&" pairs count as one item
    math = next(g for g in groups if g["name"] == "Business Core Math")
    assert (math["rule"], math["n"]) == ("n_of", 1) and math["notes"] == ["Choose one course from list below:"]
    major = [g for g in groups if g["name"] == "Accountancy, BS Major Requirements"]
    # required courses stay "all"; only the courses after "Select one of the following:" are a choice
    assert [g["rule"] for g in major] == ["all", "n_of"]


def test_prose_rules_become_manual_with_the_catalogs_words():
    groups = [g for g in parse("computer-science-bs", CS)["groups"] if g.get("kind") != "gened"]
    core = next(g for g in groups if g["name"] == "Computer Science Technical Core")
    assert core["rule"] == "all" and "CS 225" in core["courses"]
    focus = next(g for g in groups if g["name"] == "Software Foundations")
    assert focus["rule"] == "manual" and focus["courses"]  # a list under a prose rule is never "take all of these"
    assert any("single focus area" in n for n in focus["notes"])
    alternatives = next(g for g in groups if g["name"] == "Foundational Mathematics and Science")
    assert ["MATH 257", "MATH 415", "MATH 416"] in alternatives["courses"]  # "or" rows are alternatives


def test_program_and_concentration_ids_and_links():
    assert catalog_import.program_id(ACCY) == "accountancy-bs"
    assert catalog_import.program_id("https://catalog.illinois.edu/undergraduate/las/english-balas/english-teaching/") \
        == "english-balas-english-teaching"
    page = '<a href="/undergraduate/las/english-balas/english-teaching/">x</a><a href="/undergraduate/las/other/">y</a>'
    base = "https://catalog.illinois.edu/undergraduate/las/english-balas/"
    assert catalog_import.concentration_links(page, base) == [f"{base}english-teaching/"]
    index = '<a href="/undergraduate/bus/accountancy-bs/">a</a><a href="/undergraduate/bus/business-undeclared/">b</a>'
    assert catalog_import.program_links(index) == [ACCY]


def test_hand_checked_files_are_never_overwritten(tmp_path):
    (tmp_path / "accountancy-bs.yaml").write_text("id: accountancy-bs\n# checked by hand\n", encoding="utf-8")
    assert catalog_import.write(parse("accountancy-bs", ACCY), tmp_path) is False
    assert "checked by hand" in (tmp_path / "accountancy-bs.yaml").read_text(encoding="utf-8")
    (tmp_path / "accountancy-bs.yaml").unlink()
    assert catalog_import.write(parse("accountancy-bs", ACCY), tmp_path) is True
    assert "generated: '2026-11-16'" in (tmp_path / "accountancy-bs.yaml").read_text(encoding="utf-8")


NUTRITION = "https://catalog.illinois.edu/undergraduate/aces/minors/nutrition/"
HISTORY = "https://catalog.illinois.edu/undergraduate/las/minors/history/"


def test_minor_ids_and_links():
    assert catalog_import.program_id(NUTRITION) == "nutrition-minor"
    # a slug that already says "minor" isn't doubled
    assert catalog_import.program_id("https://catalog.illinois.edu/undergraduate/faa/minors/cinema-studies-minor/") \
        == "cinema-studies-minor"
    assert catalog_import.is_minor(NUTRITION) and not catalog_import.is_minor(ACCY)
    index = ('<a href="/undergraduate/aces/minors/nutrition/">a</a><a href="/undergraduate/minors/socw/">b</a>'
             '<a href="/undergraduate/bus/accountancy-bs/">c</a>')
    assert catalog_import.minor_links(index) == [NUTRITION]


def test_minor_page_type_total_and_select_n_header():
    d = parse("nutrition-minor", NUTRITION)
    assert (d["id"], d["type"], d["program"], d["total_hours"]) == (
        "nutrition-minor", "minor", "Human Nutrition Minor", 19)
    assert not any(g.get("kind") == "gened" for g in d["groups"])
    required, choice = d["groups"]
    assert required["rule"] == "all" and required["courses"] == ["FSHN 220", "FSHN 420", "FSHN 426", "FSHN 427"]
    # "Select two of the following:" written as a header row is a counted choice, not a tick box
    assert (choice["rule"], choice["n"], choice["name"]) == ("n_of", 2, "Select two of the following")
    assert "FSHN 429" in choice["courses"]


def test_minor_with_its_list_on_the_overview_tab():
    page = (FIXTURES / "catalog" / "history-minor.html").read_bytes()
    assert b"degreerequirementstextcontainer" not in page and catalog_import.has_requirements(page, HISTORY)
    d = parse("history-minor", HISTORY)
    assert d["program"] == "History Minor"  # the catalog's ", UG" suffix is dropped
    assert d["total_hours"] == 18  # from the hours column; a footnote mark beside "Total Hours" isn't read as "118"
    names = [(g["name"], g["section"], g["rule"]) for g in d["groups"]]
    assert names[0] == ("Required courses", "Requirements", "all") and d["groups"][0]["courses"] == ["HIST 200"]
    assert [g["id"] for g in d["groups"]] == ["required-courses-1", "more-requirements-2"]
    assert names[1][2] == "manual" and any("Non-Western" in n for n in d["groups"][1]["notes"])


def test_choice_headings_are_manual_but_core_and_single_electives_stay_required():
    listish = catalog_import.listish
    assert listish("Urbanism (select one)", 6) and listish("Citizen Politics Course List", 27)
    assert listish("For the Biomaterials Area", 1) and listish("Technical Electives", 5)
    assert listish("Instrumental Music Options", 3, own=False)  # one table per option under one heading
    assert not listish("Information Systems, BS Major Core Requirements and Electives", 3)  # the required core
    assert not listish("Introductory Economics Elective", 1)  # ECON 102 or ECON 103: exactly one requirement
    assert not listish("Introductory Economics Elective", 7, own=False)  # a later table under that heading
    assert not listish("Business Core Requirements", 9) and not listish("Selectional", 2)


def test_a_heading_only_turns_its_own_list_manual():
    rows = [{"kind": "code", "codes": ["PS 101"], "hours": "3"}, {"kind": "code", "codes": ["PS 201"], "hours": "3"}]
    rule = lambda r, name, **kw: [g["rule"] for g in catalog_import.program_groups(r, name, 1, **kw)]  # noqa: E731
    assert rule(rows, "Citizen Politics Course List") == ["manual"]
    assert rule(rows, "Technical Electives") == ["manual"]
    assert rule(rows, "Technical Electives", fresh=False) == ["all"]  # that heading was for a table above
    assert rule(rows, "Major Core Requirements and Electives") == ["all"]
    area = [{"kind": "area", "text": "Drawing (select one course)", "hours": ""}, *rows]
    assert rule(area, "Degree Requirements", fresh=False) == ["manual"]  # an area row is the list's own heading
    # the rule never changes a group's id, so ticked groups in saved links still match
    ids = [g["id"] for g in catalog_import.program_groups(rows, "Technical Electives", 4)]
    assert ids == [g["id"] for g in catalog_import.program_groups(rows, "Technical Electives", 4, fresh=False)]
