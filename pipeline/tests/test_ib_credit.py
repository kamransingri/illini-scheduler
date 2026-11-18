"""IB credit (#25): the same files and checks as AP (test_ap_credit.py), with levels and scores 1 to 7."""

import datetime as dt
import json

import pytest
import yaml

from pipeline import ap_credit, db
from pipeline.ap_credit import IB, ApCreditError, row_matches, validate


def doc(**more):
    base = {
        "year": "2026-2027", "entering": "Summer 2026, Fall 2026 or Spring 2027",
        "source": "https://citl.illinois.edu/current-cutoff-scores", "read_on": dt.date(2026, 11, 18),
        "exams": [{"id": "ECON", "name": "Economics", "rows": [
            {"level": "HL", "scores": [4, 5, 6, 7], "credit": {"ECON 102": 3, "ECON 103": 3}},
            {"level": "SL", "scores": [4, 5], "credit": {"ECON 1--": 3}},
            {"level": "SL", "scores": [6, 7], "credit": {"ECON 102": 3}},
        ]}],
    }
    base.update(more)
    return base


def year() -> dict:
    years = ap_credit.load_all(kind=IB)
    assert [y["label"] for y in years] == ["2026-2027"]
    return years[0]


def credit(y: dict, exam: str, level: str, score: int) -> list:
    rows = [r for r in next(e for e in y["exams"] if e["id"] == exam)["rows"]
            if row_matches(r, score, 0, "other", {}, level)]
    assert len(rows) <= 1
    return rows[0]["credit"] if rows else []


def test_the_real_file_is_valid():
    y = year()
    assert len(y["exams"]) == 86 and y["source"] == "https://citl.illinois.edu/current-cutoff-scores"
    assert all(e["levels"] and set(e["levels"]) <= {"HL", "SL"} for e in y["exams"])
    names = [e["name"] for e in y["exams"]]
    assert names == sorted(names) and len(set(names)) == len(names)


def test_facts_copied_from_the_tool():
    y = year()
    # Higher and Standard Level give different credit for the same score
    assert credit(y, "ANTH", "HL", 6) == [["ANTH 230", 3]]
    assert credit(y, "ANTH", "SL", 6) == [["ANTH 103", 3]]
    assert credit(y, "ANTH", "HL", 4) == [["ANTH 1--", 3]]
    # a 3 or below gives nothing
    assert credit(y, "ANTH", "HL", 3) == []
    # each score can be its own row
    assert credit(y, "CHINBMAN", "HL", 6) == [["CHIN 305", 5], ["CHIN 306", 5], ["CHIN 440", 3]]
    # Mandarin ab initio is filed under Chinese B in the tool; here it is its own exam, SL only
    assert next(e for e in y["exams"] if e["id"] == "CHINBAI")["levels"] == ["SL"]
    assert credit(y, "CHINBAI", "SL", 7) == [["CHIN 201", 5], ["CHIN 202", 5]]
    assert credit(y, "CHINBMAN", "SL", 4) == [["CHIN 203", 5]]


def test_every_fix_quotes_the_tool():
    for e in year()["exams"]:
        for r in e["rows"]:
            if r["fix"]:
                assert '"' in r["fix"] or "lists" in r["fix"], (e["id"], r["fix"])


def test_levels_and_scores_are_checked():
    bad = doc(exams=[{"id": "PHYS", "name": "Physics", "sub": "x", "rows": [
        {"scores": [4], "credit": {"PHYS 1--": 3}},
        {"level": "XL", "scores": [8], "credit": {"PHYS 1--": 3}},
        {"level": "SL", "scores": [5], "college": "grainger", "credit": {"PHYS 211": 4}},
    ]}])
    with pytest.raises(ApCreditError) as e:
        validate(bad, "2026-2027.yaml", IB)
    msg = str(e.value)
    for expected in ["'level' must be one of ['HL', 'SL']", "'scores' must list IB scores 1 to 7",
                     "unknown key 'college'", "unknown key 'sub'"]:
        assert expected in msg, expected


def test_overlaps_are_checked_per_level():
    validate(doc(), "2026-2027.yaml", IB)  # HL 6 and SL 6 are different rows, not an overlap
    bad = doc(exams=[{"id": "ECON", "name": "Economics", "rows": [
        {"level": "SL", "scores": [4, 5, 6], "credit": {"ECON 1--": 3}},
        {"level": "SL", "scores": [6, 7], "credit": {"ECON 102": 3}},
    ]}])
    with pytest.raises(ApCreditError, match="rows 1, 2 both apply to a score of 6"):
        validate(bad, "2026-2027.yaml", IB)


def test_export_writes_its_own_file(tmp_path):
    (tmp_path / "ib").mkdir()
    (tmp_path / "ib" / "2026-2027.yaml").write_text(yaml.safe_dump(doc()), encoding="utf-8")
    conn = db.connect(tmp_path / "t.db")
    conn.execute("INSERT INTO courses VALUES (?,?,?,?,?,'',?,'','','','')",
                 ("2027-sp", "ECON", "102", "Microeconomic Principles", "3 hours.", "SS"))
    assert ap_credit.export(conn, tmp_path, directory=tmp_path / "ib", kind=IB) == "1 IB credit table(s)"
    assert not (tmp_path / "ap-credit.json").exists()
    y = json.loads((tmp_path / "ib-credit.json").read_text(encoding="utf-8"))["years"][0]
    assert y["unknown"] == ["ECON 103"]
    exam = y["exams"][0]
    assert exam["levels"] == ["HL", "SL"]
    assert exam["rows"][0] == {"level": "HL", "scores": [4, 5, 6, 7], "sub": None, "college": None, "with": None,
                               "credit": [["ECON 102", 3], ["ECON 103", 3]], "message": None, "fix": None}
    conn.close()
