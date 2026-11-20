import json
import sqlite3

import pytest
import yaml

from pipeline import db, degrees
from pipeline.degrees import CatalogCourse, DegreeError, parse_item, resolve, validate


def doc(**groups_and_more):
    base = {
        "id": "test-bs", "program": "Test, BS", "college": "Test College", "catalog_year": "2026-2027",
        "source": "https://catalog.illinois.edu/undergraduate/test/", "read_on": "2026-11-16",
        "groups": [{"id": "core", "name": "Core", "rule": "all", "courses": ["FIN 221"]}],
    }
    base.update(groups_and_more)
    return base


CATALOG = {
    "FIN 221": CatalogCourse("Corporate Finance", [3, 3], []),
    "FIN 300": CatalogCourse("Financial Markets", [3, 3], []),
    "FIN 411": CatalogCourse("Investment", [3, 3], []),
    "FIN 412": CatalogCourse("Options", [3, 3], []),
    "FIN 490": CatalogCourse("Special Topics", [1, 4], []),
    "FIN 494": CatalogCourse("Senior Research", [3, 3], []),
    "FIN 500": CatalogCourse("Graduate", [4, 4], []),
    "STAT 107": CatalogCourse("Data Science Discovery", [4, 4], ["QR2"]),
    "CS 107": CatalogCourse("Data Science Discovery", [4, 4], ["QR2"]),
    "MATH 221": CatalogCourse("Calculus I", [4, 4], ["QR1"]),
    "RHET 101": CatalogCourse("Principles of Writing", [4, 4], []),
    "RHET 102": CatalogCourse("Principles of Research", [4, 4], []),
    "HIST 100": CatalogCourse("Global History", [3, 3], ["HP", "NW"]),
}


def test_the_real_degree_files_are_valid():
    ds = degrees.load_all()
    assert ds and all(d.groups for d in ds)
    fds = next(d for d in ds if d.id == "finance-data-science")
    assert fds.source == "https://catalog.illinois.edu/undergraduate/bus/finance-data-science-bs/"
    assert {g.kind for g in fds.groups} == {"program", "gened"}
    assert fds.type == "major" and any(d.type == "minor" for d in ds)


def test_schema_errors_are_all_reported():
    bad = doc(extra=1, catalog_year="26-27", type="certificate", groups=[
        {"id": "a", "name": "A", "rule": "n_of", "courses": ["FIN 221"]},  # no n
        {"id": "a", "name": "Dup", "rule": "all", "courses": ["fin221"]},  # duplicate id, bad code
        {"id": "m", "name": "Manual", "rule": "manual"},  # no notes
        {"id": "h", "name": "Hours", "rule": "hours", "hours": 3, "from": ["FIN 499-400"], "not_with": ["zzz"]},
        {"id": "k", "name": "Kind", "rule": "all", "kind": "minor", "courses": ["FIN 221"], "colour": "red"},
    ])
    with pytest.raises(DegreeError) as e:
        validate(bad, "bad.yaml")
    msg = str(e.value)
    for expected in ["unknown key 'extra'", "catalog_year", "needs a whole number 'n'", "duplicate id",
                     "'fin221' is not a course code", "rule 'manual' needs 'notes'", "runs backwards",
                     "'not_with' must list other group ids", "'kind' must be one of", "unknown key 'colour'",
                     "'type' must be major or minor"]:
        assert expected in msg, expected


def test_double_counting_rules_need_a_quote_and_a_known_set():
    with pytest.raises(DegreeError) as e:
        validate(doc(double_counting=[{"allow": True, "between": ["program", "minors"], "source": "x"}]))
    assert "'between' must name two kinds or exclusive sets" in str(e.value)
    assert "needs the 'quote'" in str(e.value)


def test_approved_for_lists_gen_ed_codes_and_goes_with_between():
    rule = {"allow": True, "between": ["gened", "gened"], "approved_for": ["ACP", "QR2"],
            "quote": "Exceptions are the Advanced Composition, Quantitative Reasoning II, and the Cultural Studies",
            "source": "https://gened.illinois.edu/faculty-staff/details-criteria/"}
    assert validate(doc(double_counting=[rule])).double_counting[0]["approved_for"] == ["ACP", "QR2"]
    for bad in [{**rule, "approved_for": ["WRITING"]}, {**rule, "approved_for": []},
                {k: v for k, v in rule.items() if k != "between"} | {"within": "x"}]:
        with pytest.raises(DegreeError) as e:
            validate(doc(double_counting=[bad]))
        assert "'approved_for' goes with 'between' and lists gen-ed codes" in str(e.value)


def test_alternatives_and_sequences():
    assert parse_item("MATH 221") == [["MATH 221"]]
    assert parse_item("RHET 101 + RHET 102") == [["RHET 101", "RHET 102"]]
    assert parse_item(["STAT 107", "CS 107"]) == [["STAT 107"], ["CS 107"]]
    d = validate(doc(groups=[{"id": "comp", "name": "Comp I", "rule": "n_of", "n": 1,
                              "courses": ["RHET 105", "RHET 101 + RHET 102"]}]))
    assert d.groups[0].items == [[["RHET 105"]], [["RHET 101", "RHET 102"]]]
    with pytest.raises(DegreeError):
        validate(doc(groups=[{"id": "x", "name": "X", "rule": "n_of", "n": 3, "courses": ["FIN 221", "FIN 300"]}]))


def test_pattern_range_with_exclusions_and_caps():
    d = validate(doc(groups=[{"id": "fin400", "name": "FIN 400s", "rule": "hours", "hours": 12, "from": ["FIN 400-499"],
                              "exclude": ["FIN 494"], "max_hours": {"FIN 490": 3}}]))
    eligible = resolve(d, CATALOG)
    assert eligible["fin400"] == ["FIN 411", "FIN 412", "FIN 490"]  # 494 excluded, 300 and 500 out of range
    assert d.groups[0].max_hours == {"FIN 490": 3.0}


def test_a_course_listed_in_two_groups():
    d = validate(doc(groups=[
        {"id": "ds", "name": "Data science", "rule": "all", "courses": [["STAT 107", "CS 107"]]},
        {"id": "qr", "name": "QR", "kind": "gened", "rule": "n_of", "n": 2, "from": ["gened:QR1", "gened:QR2"],
         "min_from": {"gened:QR1": 1}},
    ], double_counting=[{"allow": True, "between": ["program", "gened"], "quote": "Some Gen Ed requirements may be met",
                         "source": "https://catalog.illinois.edu/x"}]))
    eligible = resolve(d, CATALOG)
    assert "STAT 107" in eligible["qr"] and ["STAT 107"] in d.groups[0].items[0]
    assert d.groups[1].min_from == {"gened:QR1": 1}


def test_unknown_course_codes_are_logged_not_fatal():
    d = validate(doc(groups=[{"id": "core", "name": "Core", "rule": "all", "courses": ["FIN 221", "ZZZ 999"]}]))
    resolve(d, CATALOG)
    assert d.unknown == ["ZZZ 999"]


def test_export_writes_index_and_program(tmp_path):
    (tmp_path / "deg").mkdir()
    (tmp_path / "deg" / "test-bs.yaml").write_text(yaml.safe_dump(doc(groups=[
        {"id": "core", "name": "Core", "rule": "all", "courses": ["FIN 221", "ZZZ 999"]},
        {"id": "hum", "name": "Humanities", "kind": "gened", "rule": "hours", "hours": 6, "from": ["gened:HP"]},
    ])), encoding="utf-8")
    conn = db.connect(tmp_path / "t.db")
    ins = "INSERT INTO courses VALUES (?,?,?,?,?,'',?,'','','','')"
    conn.execute(ins, ("2027-sp", "FIN", "221", "Corporate Finance", "3 hours.", ""))
    conn.execute(ins, ("2027-sp", "HIST", "100", "Global History", "3 hours.", "HP NW"))
    msg = degrees.export(conn, tmp_path / "out", {"FIN 221": {"gpa": 3.1, "gn": 900, "nx": 1, "profs": []}},
                         directory=tmp_path / "deg")
    assert "1 degree file" in msg and "1 with unknown codes" in msg
    index = json.loads((tmp_path / "out" / "degrees" / "index.json").read_text())
    assert index == [{"id": "test-bs", "type": "major", "program": "Test, BS", "college": "Test College",
                      "catalog_year": "2026-2027",
                      "groups": 2, "generated": ""}]
    out = json.loads((tmp_path / "out" / "degrees" / "test-bs.json").read_text())
    assert out["unknown"] == ["ZZZ 999"]
    assert out["courses"]["FIN 221"]["gpa"] == 3.1 and out["courses"]["FIN 221"]["page"] is True
    # gen-ed courses live once, in the shared file; the page fills gen-ed groups' options from it
    shared = json.loads((tmp_path / "out" / "degrees" / "gened-courses.json").read_text())
    assert out["groups"][1]["eligible"] == [] and "HIST 100" not in out["courses"]
    assert shared["HIST 100"]["g"] == ["HP", "NW"]
    conn.close()


def test_catalog_uses_each_courses_latest_term(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    ins = "INSERT INTO courses VALUES (?,?,?,?,?,'',?,'','','','')"
    conn.execute(ins, ("2025-fa", "CS", "107", "Old title", "3 hours.", ""))
    conn.execute(ins, ("2027-sp", "CS", "107", "Data Science Discovery", "4 hours.", "QR2"))
    cat = degrees.catalog_from_db(conn)
    assert cat["CS 107"].title == "Data Science Discovery" and cat["CS 107"].credits == [4, 4]
    assert isinstance(conn, sqlite3.Connection)
    conn.close()


def test_major_overlap_rules_are_checked_and_exported(tmp_path):
    rule = {"distinct_hours": 6, "min_level": 300, "minors_too": True, "quote": "At least six hours ... distinct",
            "source": "https://catalog.illinois.edu/undergraduate/test/"}
    d = validate(doc(id="test-minor", type="minor", major_overlap=[rule]))
    assert d.major_overlap == [rule]
    with pytest.raises(DegreeError) as e:
        validate(doc(major_overlap=[rule]))  # a major
    assert "'major_overlap' is for minors" in str(e.value)
    with pytest.raises(DegreeError) as e:
        validate(doc(id="test-minor", type="minor", major_overlap=[
            {"distinct_hours": 6, "distinct_courses": 2, "min_level": 350, "from": ["ANSC 3xx"], "exclude": ["bad"],
             "minors_too": "yes", "why": "?"},
        ]))
    msg = str(e.value)
    for part in ("exactly one of 'distinct_hours' or 'distinct_courses'", "'min_level' is 100",
                 "'from' lists course ranges", "'exclude' lists course codes", "'minors_too' is true or false",
                 "unknown key 'why'", "needs the 'quote'"):
        assert part in msg
    assert degrees.to_json(d, {}, {})["major_overlap"] == [rule]
