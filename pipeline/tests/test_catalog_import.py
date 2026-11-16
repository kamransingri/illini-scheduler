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
