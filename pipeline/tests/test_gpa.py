import pandas as pd
import pytest

from pipeline import gpa
from pipeline.config import FIXTURES


def test_row_gpa_exact():
    # (4.0 + 4.0 + 3.0*2 + 0.0) / 5 graded = 2.8 ; W ignored
    assert gpa.row_gpa({"A+": 1, "A": 1, "B": 2, "F": 1, "W": 3}) == pytest.approx(2.8, abs=1e-12)
    assert gpa.row_gpa({"A-": 3, "C+": 1}) == pytest.approx((3 * 3.67 + 2.33) / 4)
    assert gpa.row_gpa({"W": 5}) is None


def test_w_rate_kept():
    a = gpa.Agg()
    a.add({"A": 6, "B": 2, "W": 2}, "2025-fa")
    p = a.pct()
    assert p["A"] == pytest.approx(0.75) and p["W"] == pytest.approx(0.2)


@pytest.fixture(scope="module")
def result():
    df = gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv")
    return gpa.compute(df)


def test_bounds(result):
    for c in result.course.values():
        assert 0 <= c["avg_gpa"] <= 4
    for i in result.instructor_course:
        assert 0 <= i["avg_gpa"] <= 4


def test_recent_window(result):
    assert len(result.recent) == 8 and all(t.endswith(("-sp", "-fa")) for t in result.recent)


def test_rhet105_has_no_data_in_window(result):
    # RHET 105 sections are <= 20 students, so FERPA exclusions remove them after 2013.
    assert ("RHET", "105") not in result.course


def test_delta_is_weighted_by_same_terms():
    rows = [
        # term 1: course avg 3.0 (X=4.0 n=1, Y=2.0 n=1); term 2: only X teaches with 2.0
        {"YearTerm": "2024-fa", "Subject": "Z", "Number": "1", "Course Title": "t", "Primary Instructor": "X, Ann",
         "A": 10},
        {"YearTerm": "2024-fa", "Subject": "Z", "Number": "1", "Course Title": "t", "Primary Instructor": "Y, Bob",
         "C": 10},
        {"YearTerm": "2025-sp", "Subject": "Z", "Number": "1", "Course Title": "t", "Primary Instructor": "X, Ann",
         "C": 10},
    ]
    df = pd.DataFrame(rows).fillna(0)
    for k in gpa.LETTERS + ["W"]:
        df[k] = df.get(k, 0)
        df[k] = df[k].fillna(0).astype(int)
    df["Students"] = df[gpa.LETTERS].sum(axis=1)
    res = gpa.compute(df, window_start="2020-fa")
    x = next(i for i in res.instructor_course if i["instructor_key"] == "x|ann")
    y = next(i for i in res.instructor_course if i["instructor_key"] == "y|bob")
    assert x["delta_vs_course"] == pytest.approx(0.5)   # +1.0 in fall (n=10), 0 in spring (n=10)
    assert y["delta_vs_course"] == pytest.approx(-1.0)
    assert x["limited_data"] == 1  # 20 students < 60


def test_geneds_fixture():
    rows = gpa.load_geneds(FIXTURES / "gpa" / "gened-courses.csv")
    assert rows and all(r["term"] for r in rows)
    cs124 = next(r for r in rows if (r["subject"], r["number"]) == ("CS", "124"))
    assert cs124["codes"] == "QR1" and cs124["categories"] == "QR"
    # Composition I (RHET 105) is not one of the dataset's categories.
    assert not any((r["subject"], r["number"]) == ("RHET", "105") for r in rows)
