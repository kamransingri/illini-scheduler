import pytest

from pipeline import course_explorer, db, offerings
from pipeline.config import FIXTURES
from pipeline.offerings import diff_records, label_pattern, predict, regular_window, summarize

W = regular_window("2027-sp")  # 2023-fa .. 2027-sp
SUMMERS = ["2024-su", "2025-su", "2026-su"]


def test_window():
    assert W == ["2023-fa", "2024-sp", "2024-fa", "2025-sp", "2025-fa", "2026-sp", "2026-fa", "2027-sp"]


@pytest.mark.parametrize("offered,label", [
    (W, "Every fall and spring"),
    (["2023-fa", "2024-fa", "2025-fa", "2026-fa"], "Fall only"),
    (["2024-sp", "2025-sp", "2026-sp", "2027-sp"], "Spring only"),
    (["2024-sp", "2026-sp"], "Spring, even years"),
    (["2023-fa", "2025-fa"], "Fall, odd years"),
    (["2024-fa", "2026-fa"], "Fall, even years"),
    (["2023-fa", "2025-sp", "2026-fa"], "Irregular (3 of the last 8 fall/spring terms)"),
    ([], "Not offered recently"),
    (["2025-su"], "Summer only"),
    ([t for t in W if t != "2025-sp"], "Almost every fall and spring"),
])
def test_labels(offered, label):
    assert label_pattern(offered, W) == label


def test_summer_suffix():
    assert label_pattern(W + SUMMERS, W, SUMMERS) == "Every fall and spring, plus summers"


def test_predict_fall_only():
    like, why = predict(["2023-fa", "2024-fa", "2025-fa", "2026-fa"], W, "2027-fa")
    assert like == "High" and "every fall" in why
    like, why = predict(["2023-fa", "2024-fa", "2025-fa", "2026-fa"], W, "2028-sp")
    assert like == "Low"


def test_predict_alternating_years():
    assert predict(["2023-fa", "2025-fa"], W, "2027-fa")[0] == "High"
    assert predict(["2024-fa", "2026-fa"], W, "2027-fa")[0] == "Low"


def test_predict_irregular():
    assert predict(["2023-fa", "2025-fa", "2026-fa"], W, "2027-fa")[0] == "Medium"
    assert predict(["2023-fa"], W, "2027-fa")[0] == "Low"


def test_cosmetic_changes_ignored():
    a = {"title": "Data Structures", "description": "Data  structures, and algorithms.", "credit_hours": "4 hours.",
         "prereq_text": "CS 128;", "gened_codes": "QR1"}
    b = dict(a, description="Data structures and algorithms")
    assert diff_records(a, b) == []


def test_meaningful_changes():
    a = {"title": "X", "description": "d", "credit_hours": "3 hours.", "prereq_text": "CS 125.",
         "gened_codes": "QR1", "online_share": 0.0}
    b = dict(a, credit_hours="4 hours.", prereq_text="CS 128.", gened_codes="QR1 HP", online_share=1.0)
    fields = {f for f, _o, _n in diff_records(a, b)}
    assert fields == {"credit_hours", "prereq_text", "gened_codes", "delivery"}
    expected = "Prerequisite changed: now lists CS 128; no longer lists CS 125"
    assert summarize("prereq_text", "CS 125.", "CS 128.") == expected
    assert summarize("credit_hours", "3 hours.", "4 hours.") == "Credit hours changed: 3 → 4"
    assert summarize("gened_codes", "QR1", "QR1 HP") == "Gen-ed added HP"


def test_real_changed_and_stable_courses(tmp_path):
    """CS 225 really added MATH 314 to its prerequisites in Fall 2025; MATH 221's catalog entry didn't change."""
    conn = db.connect(tmp_path / "t.db")
    for term in ["2024-fa", "2025-sp", "2025-fa", "2026-sp", "2026-fa", "2027-sp"]:
        c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / f"{term}.csv")
        course_explorer.store(conn, term, c, s, "csv", "")
    offerings.run(conn, "2027-sp")
    changes = conn.execute("SELECT field, summary FROM course_changes WHERE subject='MATH' AND number='221' "
                           "AND field != 'instructor'").fetchall()
    assert changes == []
    pat = conn.execute("SELECT label FROM offering_pattern WHERE subject='MATH' AND number='221'").fetchone()[0]
    assert pat.startswith("Fall only")
    stat = conn.execute("SELECT summary FROM course_changes WHERE subject='STAT' AND number='107' "
                        "AND field='description'").fetchall()
    assert any("Proficiency exams" in r[0] for r in stat)
