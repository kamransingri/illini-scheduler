import datetime as dt
import json

import pytest
import yaml

from pipeline import ap_credit, db
from pipeline.ap_credit import ApCreditError, row_matches, validate


def doc(**more):
    base = {
        "year": "2026-2027", "entering": "Summer 2026, Fall 2026 or Spring 2027",
        "source": "https://citl.illinois.edu/current-cutoff-scores", "read_on": dt.date(2026, 11, 17),
        "exams": [{"id": "STAT", "name": "Statistics", "rows": [
            {"scores": [3], "credit": {"STAT 1--": 3}},
            {"scores": [4, 5], "credit": {"STAT 100": 3}},
        ]}],
    }
    base.update(more)
    return base


def year(label: str) -> dict:
    return next(y for y in ap_credit.load_all() if y["label"] == label)


def credit(y: dict, exam: str, score: int, sub: int = 0, college: str = "other", **other: int) -> list:
    rows = [r for r in next(e for e in y["exams"] if e["id"] == exam)["rows"]
            if row_matches(r, score, sub, college, other)]
    assert len(rows) <= 1
    return rows[0]["credit"] if rows else []


def test_the_real_files_are_valid_and_cover_the_same_exams():
    years = ap_credit.load_all()
    assert [y["label"] for y in years] == ["2026-2027", "2025-2026", "2024-2025"]  # newest first
    ids = [{e["id"] for e in y["exams"]} for y in years]
    assert all(len(x) == 40 for x in ids) and ids[0] == ids[1] == ids[2]  # links keep working across years
    assert all(y["source"].startswith("https://citl.illinois.edu/") for y in years)


def test_facts_copied_from_the_pages():
    y26, y25, y24 = year("2026-2027"), year("2025-2026"), year("2024-2025")
    # Calculus BC: a 4 gives MATH 220 and 231; a 3 depends on the AB subscore; Grainger has its own rows
    assert credit(y26, "CALCBC", 4) == [["MATH 220", 5], ["MATH 231", 3]]
    assert credit(y26, "CALCBC", 3, sub=2) == [["MATH 234", 4]]
    assert credit(y26, "CALCBC", 3, sub=4) == [["MATH 220", 5]]
    assert credit(y26, "CALCBC", 3, sub=4, college="grainger") == [["MATH 220", 5]]
    assert credit(y26, "CALCBC", 2) == []
    # the 2024-2025 page credits only MATH 220 for a Grainger 5 but lists MATH 231's hours: both are kept
    assert credit(y24, "CALCBC", 5, college="grainger") == [["MATH 220", 5], ["MATH 231", 3]]
    # Chemistry gives lecture credit only
    assert credit(y26, "CHEM", 4) == [["CHEM 102", 3], ["CHEM 104", 3]]
    # French was renumbered for 2026-2027
    assert credit(y26, "FR", 3) == [["FR 203", 4]] and credit(y25, "FR", 3) == [["FR 103", 4]]
    # English Literature depends on the English Language score (0 = not taken)
    assert credit(y26, "ENGLIT", 4) == [["RHET 105", 4]]
    assert credit(y26, "ENGLIT", 4, ENGLANG=5) == [["RHET 105", 4], ["ENGL 1--", 3]]
    # Music Theory depends on the aural subscore
    assert credit(y26, "MUSTH", 5, sub=5) == [["MUS 101", 2], ["MUS 102", 2], ["MUS 107", 2]]
    assert credit(y24, "MUSTH", 4, sub=2) == [["MUS 1--", 2]]


def test_every_fix_quotes_the_page():
    for y in ap_credit.load_all():
        for e in y["exams"]:
            for r in e["rows"]:
                if r["fix"]:
                    assert '"' in r["fix"] or "page" in r["fix"], (y["label"], e["id"], r["fix"])


def test_schema_errors_are_all_reported():
    bad = doc(extra=1, year="2026-2028", source="http://x", exams=[
        {"id": "calc bc", "name": "", "rows": [{"scores": [6], "credit": {"math220": 5}}]},
        {"id": "MUS", "name": "Music", "colour": 1, "rows": [
            {"scores": [3], "sub": [9], "college": "lAS", "with": {"NOPE": [4]}, "credit": {"MUS 101": 0}},
            {"scores": [4], "credit": {}},
        ]},
    ])
    with pytest.raises(ApCreditError) as e:
        validate(bad, "2026-2027.yaml")
    msg = str(e.value)
    for expected in ["unknown key 'extra'", "'year' must look like", "'source' must be", "'id' must be",
                     "needs a 'name'", "'scores' must list", "'math220' is not a course code", "unknown key 'colour'",
                     "'sub' must list", "doesn't name its subscore", "'college' must be one of",
                     "'with' must map other exam ids", "hours for 'MUS 101'", "a row with no credit needs a 'message'"]:
        assert expected in msg, expected


def test_overlapping_rows_are_refused():
    bad = doc(exams=[{"id": "CALCBC", "name": "Calculus BC", "sub": "AB subscore", "rows": [
        {"scores": [3], "sub": [0, 1, 2, 3], "credit": {"MATH 234": 4}},
        {"scores": [3], "sub": [3, 4, 5], "credit": {"MATH 220": 5}},  # 3 with a subscore of 3 matches both
        {"scores": [4, 5], "college": "grainger", "credit": {"MATH 220": 5}},
        {"scores": [4, 5], "credit": {"MATH 231": 3}},  # no college: also applies to Grainger
    ]}])
    with pytest.raises(ApCreditError) as e:
        validate(bad, "2026-2027.yaml")
    assert "rows 1, 2 both apply to a score of 3" in str(e.value)
    assert "rows 3, 4 both apply to a score of 4" in str(e.value)


def test_the_file_name_must_match_the_year():
    with pytest.raises(ApCreditError, match="file name must match"):
        validate(doc(), "2025-2026.yaml")


def test_export_lists_unknown_codes(tmp_path):
    (tmp_path / "ap").mkdir()
    (tmp_path / "ap" / "2026-2027.yaml").write_text(yaml.safe_dump(doc(exams=[
        {"id": "STAT", "name": "Statistics", "rows": [{"scores": [4, 5], "credit": {"STAT 100": 3}}]},
        {"id": "ART2D", "name": "2-D Art and Design", "rows": [{"scores": [3, 4, 5], "credit": {"ART 105": 3}}]},
    ])), encoding="utf-8")
    conn = db.connect(tmp_path / "t.db")
    conn.execute("INSERT INTO courses VALUES (?,?,?,?,?,'',?,'','','','')",
                 ("2027-sp", "STAT", "100", "Statistics", "3 hours.", "QR1"))
    assert ap_credit.export(conn, tmp_path, directory=tmp_path / "ap") == "1 AP credit table(s)"
    out = json.loads((tmp_path / "ap-credit.json").read_text(encoding="utf-8"))
    y = out["years"][0]
    assert (y["id"], y["label"], y["read_on"]) == ("2026", "2026-2027", "2026-11-17")
    assert y["unknown"] == ["ART 105"]
    assert [e["id"] for e in y["exams"]] == ["ART2D", "STAT"]  # sorted by name
    assert y["exams"][1]["rows"][0] == {"scores": [4, 5], "sub": None, "college": None, "with": None,
                                        "credit": [["STAT 100", 3]], "message": None, "fix": None}
    conn.close()


def test_act_and_sat_files_parse_and_their_cutoffs_move_by_year():
    """#105: every row parses, ranges don't overlap (validate refuses that), each fix quotes its source."""
    y26, y25 = (y for y in ap_credit.load_all(kind=ap_credit.TEST))
    assert (y26["label"], y25["label"]) == ("2026-2027", "2025-2026")
    rhet = [["RHET 105", 4]]
    assert credit(y26, "ACTENG", 35) == rhet and credit(y26, "ACTENG", 34) == []
    assert credit(y25, "ACTENG", 34) == rhet and credit(y25, "ACTENG", 33) == []
    assert credit(y26, "SATEBRW", 740) == rhet and credit(y26, "SATEBRW", 730) == []
    assert credit(y25, "SATEBRW", 730) == rhet
    chem = [r for e in y26["exams"] if e["id"] == "SATMATH" for r in e["rows"]][0]
    assert 590 in chem["scores"] and 600 not in chem["scores"] and "Chemistry 101" in chem["message"]
    for y in (y26, y25):
        assert all('"' in r["fix"] for e in y["exams"] for r in e["rows"] if r["fix"])


def test_a_bad_act_or_sat_range_is_refused():
    exam = {"id": "SATMATH", "name": "SAT Math", "rows": [{"range": [205, 900], "credit": {}, "message": "x"}]}
    with pytest.raises(ApCreditError, match="'range' must be"):
        validate(doc(exams=[exam]), "2026-2027.yaml", ap_credit.TEST)
    exam["rows"] = [{"range": [200, 600], "credit": {}, "message": "x"},
                    {"range": [600, 800], "credit": {}, "message": "y"}]
    with pytest.raises(ApCreditError, match="both apply to a score of 600"):
        validate(doc(exams=[exam]), "2026-2027.yaml", ap_credit.TEST)
