import json

import pytest

from pipeline import course_explorer, db, export, gpa, instructors, offerings, renumbered
from pipeline.config import FIXTURES
from pipeline.names import term_order

HEADER = "old,new,first_term,source\n"


def write(tmp_path, body: str):
    p = tmp_path / "renumbered.csv"
    p.write_text("# a comment line\n" + HEADER + body, encoding="utf-8")
    return p


def test_load_reads_rows_and_rejects_bad_ones(tmp_path):
    links = renumbered.load(write(tmp_path, 'FR 103,FR 203,2026-fa,"Catalog: ""FR 103, FR 203"""\n'))
    assert links == [renumbered.Link(("FR", "103"), ("FR", "203"), "2026-fa", 'Catalog: "FR 103, FR 203"')]
    assert renumbered.load(tmp_path / "missing.csv") == []
    bad = {
        "FR103x,FR 203,2026-fa,src\n": "not a course code",
        "FR 103,FR 203,fall,src\n": "first_term",
        "FR 103,FR 203,2026-fa,\n": "needs a source",
        "FR 103,FR 103,2026-fa,src\n": "the same",
        "FR 103,FR 203,2026-fa,a\nFR 103,FR 303,2026-fa,b\n": "listed twice",
        "FR 103,FR 203,2026-fa,a\nFR 113,FR 203,2026-fa,b\n": "two old codes",
        "FR 103,FR 203,2026-fa,a\nFR 203,FR 303,2027-fa,b\n": "oldest code straight",
    }
    for body, msg in bad.items():
        with pytest.raises(ValueError, match=msg):
            renumbered.load(write(tmp_path, body))


def test_shipped_file_links_the_language_sequences():
    links = {(x.old_code, x.new_code): x for x in renumbered.load()}
    for old, new in [("FR 103", "FR 203"), ("FR 104", "FR 204"), ("GER 103", "GER 203"), ("GER 104", "GER 204"),
                     ("ITAL 103", "ITAL 203"), ("ITAL 104", "ITAL 204"), ("SPAN 141", "SPAN 203"),
                     ("SPAN 200", "SPAN 210"), ("SPAN 204", "SPAN 214")]:
        assert links[(old, new)].first_term == "2026-fa" and links[(old, new)].source


def test_renamer_only_moves_terms_before_the_change():
    rn = renumbered.Renamer([renumbered.Link(("SPAN", "200"), ("SPAN", "210"), "2026-fa", "src")])
    assert rn("SPAN", "200", "2026-sp") == ("SPAN", "210")
    assert rn("SPAN", "200", "2026-fa") == ("SPAN", "200")  # the old number reused later stays itself
    assert rn("SPAN", "204", "2024-fa") == ("SPAN", "204")
    assert rn.former("SPAN", "210", "2025-fa") == "SPAN 200"
    assert rn.former("SPAN", "210", "2026-fa") is None
    assert not renumbered.Renamer([])
    # an older catalog entry is compared in the new numbers, so a renumbered prerequisite isn't reported as a change
    assert rn.modernize("Prerequisite: SPAN 200 or SPAN200; not SPAN 2001.", "2026-sp", "2026-fa") == \
        "Prerequisite: SPAN 210 or SPAN 210; not SPAN 2001."
    assert rn.modernize("Prerequisite: SPAN 200.", "2025-fa", "2026-sp") == "Prerequisite: SPAN 200."
    # both entries already in the new numbers: a credit-exclusion sentence naming the old code stays as written
    assert rn.modernize("not both SPAN 200 and SPAN 210", "2026-fa", "2027-sp") == "not both SPAN 200 and SPAN 210"


def test_gpa_merge_counts_every_term_once():
    """Split MATH 221's real GPA rows into an "old" MATH 921 (before Fall 2021) and MATH 221, then merge them back:
    the merged course has exactly the original terms and students."""
    df = gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv")
    m = (df["Subject"] == "MATH") & (df["Number"] == "221")
    terms = sorted(set(df.loc[m, "YearTerm"]), key=term_order)
    cut = next(t for t in terms if term_order(t) >= term_order("2021-fa"))
    split = df.copy()
    split.loc[m & (split["YearTerm"].map(term_order) < term_order(cut)), "Number"] = "921"
    before = gpa.compute(df)
    rn = renumbered.Renamer([renumbered.Link(("MATH", "921"), ("MATH", "221"), cut, "test")])
    after = gpa.compute(renumbered.apply_gpa(split, rn))
    assert ("MATH", "921") not in after.course
    a, b = before.course[("MATH", "221")], after.course[("MATH", "221")]
    assert (a["terms_covered"], a["students"], a["avg_gpa"]) == (b["terms_covered"], b["students"], b["avg_gpa"])
    by_term = [(r["term"], r["students"]) for r in after.course_term if (r["subject"], r["number"]) == ("MATH", "221")]
    assert len(by_term) == len({t for t, _ in by_term})  # one row per term
    assert sorted(by_term) == sorted((r["term"], r["students"]) for r in before.course_term
                                     if (r["subject"], r["number"]) == ("MATH", "221"))


def _build(tmp_path, name, rename):
    """The fixture pipeline with STAT 107 listed as "STAT 097" before Fall 2026 (catalog and GPA), as a renumbered
    course would be; `rename` links them back, or None."""
    conn = db.connect(tmp_path / f"{name}.db")
    for term in ("2025-fa", "2026-sp", "2026-fa", "2027-sp"):
        c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / f"{term}.csv")
        course_explorer.store(conn, term, c, s, "csv", "")
    for table in ("courses", "sections"):
        conn.execute(f"UPDATE {table} SET number='097' WHERE subject='STAT' AND number='107' "
                     "AND term IN ('2025-fa', '2026-sp')")
    df = gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv")
    df.loc[(df["Subject"] == "STAT") & (df["Number"] == "107"), "Number"] = "097"
    df = renumbered.apply_gpa(df, rename) if rename else df
    res = gpa.compute(df)
    gpa.store(conn, res)
    db.set_meta(conn, "gpa_recent", ",".join(res.recent))
    instructors.run(conn, df, False, tmp_path / "x.csv", tmp_path / f"{name}-u.csv", tmp_path / "rmp")
    offerings.run(conn, "2027-sp", rename)
    out = tmp_path / name
    export.run(conn, out, rename=rename)
    return out


def test_pipeline_merges_history_labels_old_terms_and_redirects(tmp_path):
    rn = renumbered.Renamer([renumbered.Link(("STAT", "097"), ("STAT", "107"), "2026-fa", "Formerly STAT 097.")])
    out = _build(tmp_path, "merged", rn)
    doc = json.loads((out / "course" / "STAT" / "107.json").read_text())
    assert doc["formerly"][0]["code"] == "STAT 097" and doc["formerly"][0]["until"] == "2026-sp"
    hist = {h["term"]: h.get("as") for h in doc["history"]}
    assert hist["2025-fa"] == hist["2026-sp"] == "STAT 097" and hist["2026-fa"] is None
    assert all(t.get("as") == "STAT 097" for t in doc["gpa"]["by_term"])  # GPA data ends before Fall 2026
    assert any(c["field"] == "number" and c["term"] == "2026-fa" for c in doc["changes"])
    assert not (out / "course" / "STAT" / "097.json").exists()
    assert json.loads((out / "renumbered.json").read_text()) == {"STAT 097": "STAT 107"}
    search = json.loads((out / "search.json").read_text())
    assert next(c for c in search["courses"] if (c["s"], c["n"]) == ("STAT", "107"))["f"] == ["STAT 097"]

    # Same GPA as if it had never been renumbered: no term lost or counted twice.
    plain = json.loads((_build(tmp_path, "plain", None) / "course" / "STAT" / "097.json").read_text())
    strip = [{k: v for k, v in t.items() if k != "as"} for t in doc["gpa"]["by_term"]]
    assert strip == plain["gpa"]["by_term"] and doc["gpa"]["students"] == plain["gpa"]["students"]
