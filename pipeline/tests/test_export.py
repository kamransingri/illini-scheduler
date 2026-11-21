import json

from pipeline import buildings, course_explorer, db, exam_format, export, gpa, instructors, offerings
from pipeline.config import FIXTURES
from pipeline.export import bundle_opts, bundles, credit_range
from tools import api_docs


def test_credit_range():
    assert credit_range("3 OR 4 hours.") == [3, 4]
    assert credit_range("1 TO 4 hours.") == [1, 4]
    assert credit_range("") == [0, 0]


def _sec(crn, comp, group, d, s, e):
    return {"crn": crn, "component": comp, "group": group, "meetings": [{"d": d, "s": s, "e": e}]}


def test_bundles_respect_groups():
    secs = [_sec("1", "primary", "A", 10, 600, 650), _sec("2", "DIS", "A", 4, 540, 590),
            _sec("3", "primary", "B", 10, 700, 750), _sec("4", "DIS", "B", 16, 480, 530)]
    bs = bundles(secs)
    assert sorted(tuple(s["crn"] for s in b) for b in bs) == [("1", "2"), ("3", "4")]
    # [earliest start, latest end, days, flags]; 4 = the builder makes it by default, 2 = with special sections too
    assert bundle_opts(secs) == [[480, 750, 26, 6], [540, 650, 14, 6]]


def test_bundle_opts_flags_closed_special_and_untimed_sections():
    """What the gen-ed finder's "fits your times" check needs to agree with the schedule builder."""
    secs = [{**_sec("1", "primary", "A", 10, 600, 650), "status": "Closed"},
            {**_sec("2", "primary", "B", 16, 480, 530), "special": "Unusual section code"},
            {**_sec("3", "primary", "C", 0, None, None), "status": "Open"}]
    assert bundle_opts(secs) == [[-1, -1, 0, 6], [480, 530, 16, 2], [600, 650, 10, 7]]


def test_export_end_to_end(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    for term in ("2026-fa", "2027-sp"):
        c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / f"{term}.csv")
        course_explorer.store(conn, term, c, s, "wade-course-catalog", "2026-10-30T00:00:00-05:00")
    df = gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv")
    res = gpa.compute(df)
    gpa.store(conn, res)
    db.set_meta(conn, "gpa_recent", ",".join(res.recent))
    instructors.run(conn, df, False, tmp_path / "x.csv", tmp_path / "u.csv", tmp_path / "rmp")
    offerings.run(conn, "2027-sp")
    exam_format.run(conn)
    buildings.run(conn, FIXTURES / "osm" / "campus.json", "2027-sp")
    msg = export.run(conn, tmp_path / "out")
    assert "course files" in msg
    # every in-person meeting's building on the reference courses' pages has a location (#93)
    places = json.loads((tmp_path / "out" / "buildings.json").read_text())
    assert "OpenStreetMap" in places["credit"] and places["osm_base"]
    met = {m["b"] for c in ("CS/124", "STAT/107", "RHET/105") for s in json.loads(
        (tmp_path / "out" / "course" / f"{c}.json").read_text())["terms"]["2027-sp"]["sections"] for m in s["meetings"]}
    met -= {"", "Location Pending"}
    assert met and met <= set(places["buildings"])
    assert all({"name", "short", "lat", "lon"} <= set(p) for p in places["buildings"].values())
    cs = json.loads((tmp_path / "out" / "course" / "CS" / "124.json").read_text())
    assert cs["gpa"]["recent"] and cs["terms"]["2027-sp"]["sections"]
    assert cs["terms"]["2027-sp"]["status_known"] is False  # pre-registration snapshot
    # no GPA rows in the window (FERPA withholds its small sections, D2.5): no GPA anywhere, never a borrowed one (#192)
    rhet = json.loads((tmp_path / "out" / "course" / "RHET" / "105.json").read_text())
    assert rhet["gpa"] is None and rhet["terms"]["2027-sp"]["sections"]
    assert rhet["instructors"] and all(p["gpa"] is None for p in rhet["instructors"].values())
    rhet_search = next(c for c in json.loads((tmp_path / "out" / "search.json").read_text())["courses"]
                       if (c["s"], c["n"]) == ("RHET", "105"))
    assert rhet_search["gpa"] is None
    rhet_gened = [r for r in json.loads((tmp_path / "out" / "geneds.json").read_text())
                  if (r["s"], r["n"]) == ("RHET", "105")]
    assert rhet_gened and all(r["gpa"] is None and r["pctA"] is None for r in rhet_gened)
    math = json.loads((tmp_path / "out" / "course" / "MATH" / "221.json").read_text())
    assert "2027-sp" not in math["terms"] and math["pattern"]["label"].startswith("Fall only")
    meta = json.loads((tmp_path / "out" / "meta.json").read_text())
    assert meta["next_term"] == "2027-sp" and meta["rmp_status"].startswith("unavailable")
    search = json.loads((tmp_path / "out" / "search.json").read_text())
    assert {"s": "CS", "n": "124"}.items() <= next(c for c in search["courses"] if c["n"] == "124").items()
    # when a course usually runs, for the four-year plan's warnings (#116): MATH 221 is fall only here
    assert next(c for c in search["courses"] if (c["s"], c["n"]) == ("MATH", "221"))["o"] == "f"
    crns = json.loads((tmp_path / "out" / "crns.json").read_text())
    assert list(crns)[0] == "2027-sp"  # next term first
    crn, row = next((k, v) for k, v in crns["2027-sp"].items() if v[:2] == ["CS", "124"])
    assert len(crn) == 5 and row[2] in {s["code"] for s in cs["terms"]["2027-sp"]["sections"]}
    assert meta["live_url"].endswith("/live.json")
    assert meta["format_version"] == export.DATA_FORMAT
    assert api_docs.check_dir(tmp_path / "out") == []  # every exported field is in docs/API.md


def test_score_priors():
    from pipeline.export import score_priors

    gpa_rows = [{"subject": "CS", "recent_avg_gpa": 3.0, "recent_students": 100},
                {"subject": "CS", "recent_avg_gpa": 4.0, "recent_students": 300},
                {"subject": "MATH", "recent_avg_gpa": 2.5, "recent_students": 100},
                {"subject": "ART", "recent_avg_gpa": None, "recent_students": 0}]
    rmp_rows = [{"num_ratings": 10, "avg_rating": 4.0, "avg_difficulty": 3.0, "would_take_again_pct": 80.0},
                {"num_ratings": 2, "avg_rating": 2.0, "avg_difficulty": 4.0, "would_take_again_pct": -1.0},
                {"num_ratings": 0, "avg_rating": 0.0, "avg_difficulty": 0.0, "would_take_again_pct": -1.0}]
    p = score_priors(gpa_rows, rmp_rows)
    assert p["subject_gpa"] == {"CS": 3.75, "MATH": 2.5}  # student-weighted; subjects without data left out
    assert p["campus_gpa"] == round((300 + 1200 + 250) / 500, 3)
    # profiles with no ratings don't count; RMP's -1 "no answer" for would-take-again is skipped
    assert p["rmp"] == {"quality": 3.0, "difficulty": 3.5, "would_take_again": 80.0, "n_instructors": 2}


def test_flag_special():
    from pipeline.export import flag_special

    def s(code, comp, group, text=""):
        return {"code": code, "component": comp, "group": group, "text": text, "special": ""}

    secs = [s("AL1", "primary", "A"), s("AD1", "DIS", "A"), s("WWC", "primary", "W"), s("AD@", "primary", "A"),
            s("", "primary", "A")]
    flag_special(secs)
    assert [bool(x["special"]) for x in secs] == [False, False, True, True, False]


def test_bundles_match_the_shared_parity_cases():
    """The web app has its own copy of this rule (web/lib/schedule.ts); both check fixtures/bundle-parity.json."""
    cases = json.loads((FIXTURES / "bundle-parity.json").read_text(encoding="utf-8"))["cases"]
    for case in cases:
        got = sorted(sorted(s["crn"] for s in b) for b in bundles(case["sections"], case.get("include_special", True)))
        assert got == sorted(sorted(b) for b in case["bundles"]), case["name"]


def test_rmp_on_course_pages(tmp_path):
    """Course pages show RMP for past instructors too, this course's reviews first (6 at most), and never a profile
    that doesn't fit the course's subject (#13: an Education professor's reviews on MATH 221)."""
    conn = db.connect(tmp_path / "t.db")
    for term in ("2026-fa", "2027-sp"):
        c, s = course_explorer.parse_catalog_csv(FIXTURES / "course-catalog" / f"{term}.csv")
        course_explorer.store(conn, term, c, s, "wade-course-catalog", "2026-10-30T00:00:00-05:00")
    df = gpa.load_gpa_csv(FIXTURES / "gpa" / "uiuc-gpa-dataset.csv")
    res = gpa.compute(df)
    gpa.store(conn, res)
    instructors.run(conn, df, False, tmp_path / "x.csv", tmp_path / "u.csv", tmp_path / "rmp")
    reviews = ([{"text": f"220 #{i}", "course": "MATH220", "date": f"2026-0{i + 1}-01"} for i in range(5)]
               + [{"text": f"221 #{i}", "course": "MATH 221", "date": f"2025-0{i + 1}-01"} for i in range(3)])
    rows = [("209729", "Kim", "Whittlesey", "Mathematics", reviews, "whittlesey|kim"),
            ("475290", "James", "Anderson", "Education", [{"text": "x", "course": "AFRO310", "date": ""}],
             "petrickova|sarka")]
    for rid, first, last, dept, revs, key in rows:
        conn.execute("INSERT INTO rmp VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                     (rid, first, last, dept, 4.5, 3.0, 90.0, 104, "[]", json.dumps(revs), "2026-11-16T00:00:00+00:00"))
        conn.execute("UPDATE instructors SET rmp_id=? WHERE instructor_key=?", (rid, key))
    export.run(conn, tmp_path / "out")
    math = json.loads((tmp_path / "out" / "course" / "MATH" / "221.json").read_text())
    kim = math["instructors"]["whittlesey|kim"]
    assert not kim["teaching"]  # grade history only: before, past instructors got no RMP at all
    assert [r["text"] for r in kim["rmp"]["reviews"]] == ["221 #0", "221 #1", "221 #2", "220 #0", "220 #1", "220 #2"]
    assert math["instructors"]["petrickova|sarka"]["rmp"] is None
