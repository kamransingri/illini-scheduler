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
         "A": 25},
        {"YearTerm": "2024-fa", "Subject": "Z", "Number": "1", "Course Title": "t", "Primary Instructor": "Y, Bob",
         "C": 25},
        {"YearTerm": "2025-sp", "Subject": "Z", "Number": "1", "Course Title": "t", "Primary Instructor": "X, Ann",
         "C": 25},
    ]
    df = pd.DataFrame(rows).fillna(0)
    for k in gpa.LETTERS + ["W"]:
        df[k] = df.get(k, 0)
        df[k] = df[k].fillna(0).astype(int)
    df["Students"] = df[gpa.LETTERS].sum(axis=1)
    res = gpa.compute(df, window_start="2020-fa")
    x = next(i for i in res.instructor_course if i["instructor_key"] == "x|ann")
    y = next(i for i in res.instructor_course if i["instructor_key"] == "y|bob")
    assert x["delta_vs_course"] == pytest.approx(0.5)   # +1.0 in fall (n=25), 0 in spring (n=25)
    assert y["delta_vs_course"] == pytest.approx(-1.0)
    assert x["limited_data"] == 1  # 50 students < 60


def _row(term, subj, num, who, **counts):
    return {"YearTerm": term, "Subject": subj, "Number": num, "Course Title": "t", "Primary Instructor": who,
            **{k: counts.get(k, 0) for k in gpa.LETTERS + ["W"]},
            "Students": counts.get("Students", sum(counts.get(k, 0) for k in gpa.LETTERS))}


def test_withheld_row_stops_the_build():
    """A section of 20 students is one the University withholds (FERPA): compute() refuses it and names it (#192)."""
    df = pd.DataFrame([_row("2025-fa", "CS", "124", "Lewis, Colleen", A=30),
                       _row("2025-fa", "RHET", "105", "Doe, Jane", A=12, B=8)])
    with pytest.raises(gpa.WithheldGradeData) as e:
        gpa.compute(df)
    msg = str(e.value)
    assert msg.startswith("1 GPA row(s) have fewer than 21 students")
    assert "2025-fa RHET 105 (Doe, Jane): Students 20, letter grades 20" in msg
    assert "CS 124" not in msg


def test_withheld_by_letter_total_even_when_students_says_more():
    # Students claims 25 but only 20 letter grades are given (A+ to F): still too small to publish
    df = pd.DataFrame([_row("2025-fa", "Z", "1", "X, Ann", A=15, C=5, W=5, Students=25)])
    with pytest.raises(gpa.WithheldGradeData, match="Students 25, letter grades 20"):
        gpa.compute(df)


def test_withheld_checks_rows_outside_the_window():
    # rows before WINDOW_START never reach the site today, but a smaller window would publish them
    df = pd.DataFrame([_row("2010-fa", "Z", "1", "X, Ann", A=5), _row("2025-fa", "Z", "1", "X, Ann", A=30)])
    with pytest.raises(gpa.WithheldGradeData):
        gpa.compute(df)


def test_withheld_message_lists_at_most_20_rows():
    df = pd.DataFrame([_row("2025-fa", "Z", str(i), "X, Ann", A=3) for i in range(25)])
    with pytest.raises(gpa.WithheldGradeData) as e:
        gpa.compute(df)
    assert str(e.value).count("\n  2025-fa Z ") == 20 and "...and 5 more" in str(e.value)


def test_exactly_21_students_is_published():
    res = gpa.compute(pd.DataFrame([_row("2025-fa", "Z", "1", "X, Ann", A=21)]), window_start="2020-fa")
    assert res.course[("Z", "1")]["students"] == 21


def test_real_fixture_passes_the_check():
    gpa.check_withheld(gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv"))


def test_geneds_fixture():
    rows = gpa.load_geneds(FIXTURES / "gpa" / "gened-courses.csv")
    assert rows and all(r["term"] for r in rows)
    cs124 = next(r for r in rows if (r["subject"], r["number"]) == ("CS", "124"))
    assert cs124["codes"] == "QR1" and cs124["categories"] == "QR"
    # Composition I (RHET 105) is not one of the dataset's categories.
    assert not any((r["subject"], r["number"]) == ("RHET", "105") for r in rows)
