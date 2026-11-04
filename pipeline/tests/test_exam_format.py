import pytest

from pipeline.exam_format import FIELDS, extract, merge
from pipeline.notes import load_file


def one(text, field):
    found = extract(text, "test").get(field, [])
    return found[0][0] if found else "unknown"


@pytest.mark.parametrize("text,field,value", [
    ("There are 3 midterms and a final, all in the CBTF.", "n_midterms", 3),
    ("There are 3 midterms and a final, all in the CBTF.", "exam_mode", "CBTF"),
    ("There are 3 midterms and a final, all in the CBTF.", "has_final", "yes"),
    ("Two midterms, no final.", "n_midterms", 2),
    ("Two midterms, no final.", "has_final", "no"),
    ("The final is optional and replaces your lowest midterm.", "has_final", "optional"),
    ("There is no final exam, just a project.", "has_final", "no"),
    ("We did a final project instead of a final exam.", "has_final", "no"),
    ("Exams are not curved.", "curve", "no"),
    ("He doesn't curve at all.", "curve", "no"),
    ("Grades were curved at the end.", "curve", "yes"),
    ("Generous curve on the exams.", "curve", "yes"),
    ("We covered curve fitting and the normal curve.", "curve", "unknown"),
    ("Attendance is not mandatory, lectures are recorded.", "attendance_required", "no"),
    ("Attendance is mandatory with iClicker questions.", "attendance_required", "yes"),
    ("Homework is on PrairieLearn every week.", "homework_platform", "PrairieLearn"),
    ("WebAssign homework is due every Friday.", "homework_platform", "WebAssign"),
    ("The take-home midterm was fair.", "exam_mode", "take-home"),
    ("Fabrication of two take-home devices.", "exam_mode", "unknown"),
    ("Online exams through Proctorio.", "exam_mode", "online"),
    ("There are no group projects in this class.", "group_projects", "no"),
    ("A semester-long group project with a demo.", "group_projects", "yes"),
    ("There is no required textbook.", "textbook_required", "no"),
    ("You don't need the textbook.", "textbook_required", "no"),
    ("The textbook is required for the readings.", "textbook_required", "yes"),
    ("Instructional technologies such as computer-based testing.", "exam_mode", "unknown"),
    ("One midterm and a cumulative final exam.", "n_midterms", 1),
    ("No midterms, only weekly quizzes.", "n_midterms", 0),
    ("Practical exercises, a mid-term exam, and a final exam.", "n_midterms", 1),
    ("Prerequisite: An adequate ALEKS placement score.", "homework_platform", "unknown"),
])
def test_rules(text, field, value):
    assert one(text, field) == value


def test_unknown_by_default():
    prof = merge([extract("Great lectures, very kind.", "test")])
    assert all(prof[f]["value"] == "unknown" for f in FIELDS)


def test_majority_and_agreement():
    prof = merge([extract("Exams are curved.", "a"), extract("Grades were curved.", "b"),
                  extract("Exams are not curved.", "c")])
    assert prof["curve"]["value"] == "yes" and prof["curve"]["agree"] == 2 and prof["curve"]["total"] == 3
    assert all(len(e["quote"]) <= 121 for e in prof["curve"]["evidence"])


def test_every_known_field_has_a_quote():
    text = ("Three midterms in the CBTF, no final. Homework on PrairieLearn. Attendance is not required. "
            "No group projects. The textbook is optional. Exams are not curved.")
    prof = merge([extract(text, "review")])
    for f in FIELDS:
        if prof[f]["value"] != "unknown":
            assert prof[f]["evidence"] and prof[f]["evidence"][0]["quote"]


def test_long_sentence_quote_trimmed():
    text = "x " * 100 + "and the exams are not curved at all " + "y " * 100
    ev = extract(text, "r")["curve"][0][1]
    assert len(ev.quote) <= 122 and "not curved" in ev.quote


def test_notes_yaml(tmp_path):
    p = tmp_path / "cs-124.yaml"
    p.write_text('course: CS 124\nnotes:\n  - instructor: "Challen, G"\n    term: 2026-fa\n'
                 '    text: "Weekly quizzes in the CBTF; no final."\n')
    notes = load_file(p)
    assert notes[0].subject == "CS" and notes[0].number == "124" and notes[0].fallback_key == "challen|g"
