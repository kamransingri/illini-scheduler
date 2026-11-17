import json

from pipeline import notes_intake as ni
from pipeline.notes import load_file

URL = "https://github.com/kamransingri/illini-scheduler/issues"


def body(course="CS 124", instructor="Challen, G", term="Fall 2026", note="Weekly quizzes in the CBTF; no final.",
         ticked=True):
    """What GitHub writes for an issue form: "### Label", a blank line, the answer ("_No response_" when empty)."""
    parts = [("Course", course), ("Instructor", instructor), ("Term taken", term), ("Note", note),
             ("Posting policy", f"- [{'X' if ticked else ' '}] This note is about the course and its teaching.")]
    return "\n\n".join(f"### {label}\n\n{value or '_No response_'}" for label, value in parts)


def issue(n, **kw):
    return {"number": n, "url": f"{URL}/{n}", "body": body(**kw)}


def test_a_filled_form_becomes_a_submission():
    s, why = ni.parse_issue(issue(12))
    assert why == "" and s is not None
    assert (s.course, s.instructor, s.term, s.text, s.url) == (
        "CS 124", "Challen, G", "2026-fa", "Weekly quizzes in the CBTF; no final.", f"{URL}/12")
    s, _ = ni.parse_issue(issue(13, course="stat107", instructor="", term="", note="  Curved   exams.\n\nNo final. "))
    assert s is not None and (s.course, s.instructor, s.term, s.text) == ("STAT 107", "", "", "Curved exams. No final.")


def test_terms_in_the_ways_people_write_them():
    assert [ni.parse_term(t) for t in ("Spring 2027", "fall '26", "2026-fa", "Summer 26", "")] == [
        "2027-sp", "2026-fa", "2026-fa", "2026-su", ""]
    assert ni.parse_term("last year") is None


def test_what_cant_be_used_says_why():
    assert "doesn't look like 'CS 124'" in ni.parse_issue(issue(1, course="intro CS"))[1]
    assert "doesn't look like 'Fall 2026'" in ni.parse_issue(issue(2, term="sometime"))[1]
    assert "at most 600" in ni.parse_issue(issue(3, note="x" * 601))[1]
    assert "posting policy" in ni.parse_issue(issue(4, ticked=False))[1]
    assert "empty" in ni.parse_issue(issue(5, note=""))[1]


def test_notes_are_appended_once_and_the_site_can_read_them(tmp_path):
    a, _ = ni.parse_issue(issue(12))
    b, _ = ni.parse_issue(issue(14, instructor="", term="Spring 2027", note="Lots of MPs."))
    assert a is not None and b is not None
    assert ni.add_notes([a, b], tmp_path) == [a, b]
    assert ni.add_notes([a, b], tmp_path) == []  # already sources: running again changes nothing
    notes = load_file(tmp_path / "cs-124.yaml")
    assert [(n.instructor, n.term, n.text, n.source) for n in notes] == [
        ("Challen, G", "2026-fa", "Weekly quizzes in the CBTF; no final.", f"{URL}/12"),
        ("", "2027-sp", "Lots of MPs.", f"{URL}/14")]


def test_main_writes_notes_and_a_pr_that_closes_the_issues(tmp_path):
    issues = tmp_path / "issues.json"
    issues.write_text(json.dumps([issue(14, course="MATH 221", instructor="Whittlesey, K"), issue(9, ticked=False)]))
    pr = tmp_path / "pr.md"
    assert ni.main(["--issues", str(issues), "--pr-body", str(pr), "--dir", str(tmp_path / "notes")]) == 0
    assert (tmp_path / "notes" / "math-221.yaml").exists()
    text = pr.read_text(encoding="utf-8")
    assert "- MATH 221 (Whittlesey, K): Weekly quizzes" in text and "Closes #14" in text
    assert "#9: the posting policy box isn't ticked" in text and "Closes #9" not in text
