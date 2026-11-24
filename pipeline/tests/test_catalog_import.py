import re

import yaml

from pipeline import catalog_import
from pipeline.config import FIXTURES
from pipeline.degrees import validate

ACCY = "https://catalog.illinois.edu/undergraduate/bus/accountancy-bs/"
CS = "https://catalog.illinois.edu/undergraduate/engineering/computer-science-bs/"


def parse(name, url):
    doc = catalog_import.parse_program((FIXTURES / "catalog" / f"{name}.html").read_bytes(), url, "2026-11-16")
    validate(yaml.safe_load(yaml.safe_dump(doc)), doc["id"])  # every generated file must pass the schema
    return doc


def test_program_header_and_campus_gened_table():
    d = parse("accountancy-bs", ACCY)
    assert (d["id"], d["program"], d["college"], d["catalog_year"]) == (
        "accountancy-bs", "Accountancy, BS", "Gies College of Business", "2026-2027")
    assert d["total_hours"] == 124 and d["generated"] == "2026-11-16"
    gen = {g["id"]: g for g in d["groups"] if g.get("kind") == "gened"}
    assert set(gen) >= {"comp1", "acp", "hum", "nat", "sbs", "cs-nw", "cs-us", "cs-wcc", "qr", "language"}
    assert gen["sbs"]["notes"] == ["fulfilled by ECON 102 and ECON 103"]
    assert gen["qr"]["min_from"] == {"gened:QR1": 1} and gen["language"]["rule"] == "manual"
    # the page's own sentence lets program courses count as gen-eds
    assert any(r.get("between") == ["program", "gened"] for r in d["double_counting"])
    # campus policy: an ACP or QR II course counts for its other category too (#18)
    two = next(r for r in d["double_counting"] if r.get("approved_for"))
    assert two["between"] == ["gened", "gened"] and two["approved_for"] == ["ACP", "QR2"]
    assert two["source"] == "https://gened.illinois.edu/faculty-staff/details-criteria/"


def test_required_lists_pairs_and_select_one_segments():
    groups = [g for g in parse("accountancy-bs", ACCY)["groups"] if g.get("kind") != "gened"]
    core = next(g for g in groups if g["name"] == "Business Core Requirements")
    assert core["rule"] == "all" and "ACCY 201 + ACCY 202" in core["courses"]  # "&" pairs count as one item
    math = next(g for g in groups if g["name"] == "Business Core Math")
    assert (math["rule"], math["n"]) == ("n_of", 1) and math["notes"] == ["Choose one course from list below:"]
    major = [g for g in groups if g["name"] == "Accountancy, BS Major Requirements"]
    # required courses stay "all"; only the courses after "Select one of the following:" are a choice
    assert [g["rule"] for g in major] == ["all", "n_of"]


def test_prose_rules_become_manual_with_the_catalogs_words():
    groups = [g for g in parse("computer-science-bs", CS)["groups"] if g.get("kind") != "gened"]
    core = next(g for g in groups if g["name"] == "Computer Science Technical Core")
    assert core["rule"] == "all" and "CS 225" in core["courses"]
    focus = next(g for g in groups if g["name"] == "Software Foundations")
    assert focus["rule"] == "manual" and focus["courses"]  # a list under a prose rule is never "take all of these"
    assert any("single focus area" in n for n in focus["notes"])
    alternatives = next(g for g in groups if g["name"] == "Foundational Mathematics and Science")
    assert ["MATH 257", "MATH 415", "MATH 416"] in alternatives["courses"]  # "or" rows are alternatives


def test_program_and_concentration_ids_and_links():
    assert catalog_import.program_id(ACCY) == "accountancy-bs"
    assert catalog_import.program_id("https://catalog.illinois.edu/undergraduate/las/english-balas/english-teaching/") \
        == "english-balas-english-teaching"
    page = '<a href="/undergraduate/las/english-balas/english-teaching/">x</a><a href="/undergraduate/las/other/">y</a>'
    base = "https://catalog.illinois.edu/undergraduate/las/english-balas/"
    assert catalog_import.concentration_links(page, base) == [f"{base}english-teaching/"]
    index = '<a href="/undergraduate/bus/accountancy-bs/">a</a><a href="/undergraduate/bus/business-undeclared/">b</a>'
    assert catalog_import.program_links(index) == [ACCY]


def test_hand_checked_files_are_never_overwritten(tmp_path):
    (tmp_path / "accountancy-bs.yaml").write_text("id: accountancy-bs\n# checked by hand\n", encoding="utf-8")
    assert catalog_import.write(parse("accountancy-bs", ACCY), tmp_path) is False
    assert "checked by hand" in (tmp_path / "accountancy-bs.yaml").read_text(encoding="utf-8")
    (tmp_path / "accountancy-bs.yaml").unlink()
    assert catalog_import.write(parse("accountancy-bs", ACCY), tmp_path) is True
    assert "generated: '2026-11-16'" in (tmp_path / "accountancy-bs.yaml").read_text(encoding="utf-8")


NUTRITION = "https://catalog.illinois.edu/undergraduate/aces/minors/nutrition/"
HISTORY = "https://catalog.illinois.edu/undergraduate/las/minors/history/"


def test_minor_ids_and_links():
    assert catalog_import.program_id(NUTRITION) == "nutrition-minor"
    # a slug that already says "minor" isn't doubled
    assert catalog_import.program_id("https://catalog.illinois.edu/undergraduate/faa/minors/cinema-studies-minor/") \
        == "cinema-studies-minor"
    assert catalog_import.is_minor(NUTRITION) and not catalog_import.is_minor(ACCY)
    index = ('<a href="/undergraduate/aces/minors/nutrition/">a</a><a href="/undergraduate/minors/socw/">b</a>'
             '<a href="/undergraduate/bus/accountancy-bs/">c</a>')
    assert catalog_import.minor_links(index) == [NUTRITION]


def test_minor_page_type_total_and_select_n_header():
    d = parse("nutrition-minor", NUTRITION)
    assert (d["id"], d["type"], d["program"], d["total_hours"]) == (
        "nutrition-minor", "minor", "Human Nutrition Minor", 19)
    assert not any(g.get("kind") == "gened" for g in d["groups"])
    required, choice = d["groups"]
    assert required["rule"] == "all" and required["courses"] == ["FSHN 220", "FSHN 420", "FSHN 426", "FSHN 427"]
    # "Select two of the following:" written as a header row is a counted choice, not a tick box
    assert (choice["rule"], choice["n"], choice["name"]) == ("n_of", 2, "Select two of the following")
    assert "FSHN 429" in choice["courses"]


def test_minor_with_its_list_on_the_overview_tab():
    page = (FIXTURES / "catalog" / "history-minor.html").read_bytes()
    assert b"degreerequirementstextcontainer" not in page and catalog_import.has_requirements(page, HISTORY)
    d = parse("history-minor", HISTORY)
    assert d["program"] == "History Minor"  # the catalog's ", UG" suffix is dropped
    assert d["total_hours"] == 18  # from the hours column; a footnote mark beside "Total Hours" isn't read as "118"
    names = [(g["name"], g["section"], g["rule"]) for g in d["groups"]]
    assert names[0] == ("Required courses", "Requirements", "all") and d["groups"][0]["courses"] == ["HIST 200"]
    assert [g["id"] for g in d["groups"]] == ["required-courses-1", "more-requirements-2"]
    assert names[1][2] == "manual" and any("Non-Western" in n for n in d["groups"][1]["notes"])


def test_choice_headings_are_manual_but_core_and_single_electives_stay_required():
    listish = catalog_import.listish
    assert listish("Urbanism (select one)", 6) and listish("Citizen Politics Course List", 27)
    assert listish("For the Biomaterials Area", 1) and listish("Technical Electives", 5)
    assert listish("Instrumental Music Options", 3, own=False)  # one table per option under one heading
    assert not listish("Information Systems, BS Major Core Requirements and Electives", 3)  # the required core
    assert not listish("Introductory Economics Elective", 1)  # ECON 102 or ECON 103: exactly one requirement
    assert not listish("Introductory Economics Elective", 7, own=False)  # a later table under that heading
    assert not listish("Business Core Requirements", 9) and not listish("Selectional", 2)


def test_a_heading_only_turns_its_own_list_manual():
    rows = [{"kind": "code", "codes": ["PS 101"], "hours": "3"}, {"kind": "code", "codes": ["PS 201"], "hours": "3"}]
    rule = lambda r, name, **kw: [g["rule"] for g in catalog_import.program_groups(r, name, 1, **kw)]  # noqa: E731
    assert rule(rows, "Citizen Politics Course List") == ["manual"]
    assert rule(rows, "Technical Electives") == ["manual"]
    assert rule(rows, "Technical Electives", fresh=False) == ["all"]  # that heading was for a table above
    assert rule(rows, "Major Core Requirements and Electives") == ["all"]
    area = [{"kind": "area", "text": "Drawing (select one course)", "hours": ""}, *rows]
    # an area row is the list's own heading; one that says how many to pick is a counted choice (#17)
    assert rule(area, "Degree Requirements", fresh=False) == ["n_of"]
    assert catalog_import.program_groups(area, "Degree Requirements", 1, fresh=False)[0]["n"] == 1
    # the rule never changes a group's id, so ticked groups in saved links still match
    ids = [g["id"] for g in catalog_import.program_groups(rows, "Technical Electives", 4)]
    assert ids == [g["id"] for g in catalog_import.program_groups(rows, "Technical Electives", 4, fresh=False)]


# ---- #17: importer fixes found by hand-checking the largest majors, on saved catalog pages -----------------------

ME = "https://catalog.illinois.edu/undergraduate/engineering/mechanical-engineering-bs/"
COGN = "https://catalog.illinois.edu/undergraduate/las/psychology-bslas/cognitive-neuroscience/"
DEVP = "https://catalog.illinois.edu/undergraduate/las/psychology-bslas/developmental-psychology/"


def program(doc):
    return {g["name"]: g for g in doc["groups"] if g.get("kind") != "gened"}


def test_an_advisory_comment_is_a_note_not_a_rule():
    """CS: "Highly recommended, optional 1 credit hour course, CS 100..." sits between ENG 100 and CS 210/211; it
    used to turn CS 210 or CS 211 into a tick box."""
    g = program(parse("computer-science-bs", CS))["Orientation and Professional Development"]
    assert (g["rule"], g["courses"]) == ("all", ["ENG 100", ["CS 210", "CS 211"]])
    assert any("optional" in n for n in g["notes"])
    assert catalog_import.advisory("Recommended, optional 1 credit course, CHEM 103 General Chemistry Lab I.")
    assert not catalog_import.advisory("Students must take one recommended course from the list below.")


def test_a_rule_above_a_named_list_is_that_lists_rule():
    """CS: "At least one ... must be chosen from the list below" then "Team Project Course List:" is one requirement,
    not an empty tick box plus a list; the focus-area rule goes with the focus areas only."""
    d = parse("computer-science-bs", CS)
    groups = program(d)
    team = groups["Team Project Course List"]
    assert len(team["courses"]) == 13 and team["notes"][0].startswith("At least one (1)")
    assert not any(g["rule"] == "manual" and not g.get("courses") and "At least one (1)" in g["notes"][0]
                   for g in d["groups"])  # no empty duplicate
    assert all("At least one (1)" not in n for n in groups["Machines"]["notes"])
    assert any("single focus area" in n for n in groups["Machines"]["notes"])
    # a rule of its own ("six additional technical electives") still stands alone
    assert groups["Technical Electives"]["rule"] == "manual" and not groups["Technical Electives"].get("courses")


def test_choose_n_in_a_heading_and_across_its_sub_lists():
    d = parse("psychology-bslas-cognitive-neuroscience", COGN)
    assert d["id"] == "psychology-bslas-cognitive-neuroscience" and d["program"].startswith("Psychology: Cognitive")
    g = program(d)
    core = g["Cognitive Neuroscience Concentration Core Course (choose one)"]
    assert (core["rule"], core["n"], core["courses"]) == ("n_of", 1, ["PSYC 204", "PSYC 220"])
    # "Group 1 (choose one):" over two sub-lists is one choice across both, each sub-list named in the notes
    g1 = g["Psychological Science Breadth, Group 1 (choose one)"]
    assert (g1["rule"], g1["n"], len(g1["courses"])) == ("n_of", 1, 7)
    assert any(n.startswith("Behavioral and Cognitive Neuroscience: PSYC 204") for n in g1["notes"])
    assert g["Cognitive Neuroscience Advanced Course (choose two)"]["n"] == 2
    # a heading with hours and no list is kept, not dropped
    extra = g["Additional Advanced (300- or 400-level) PSYC or BCOG Courses"]
    assert extra["rule"] == "manual" and "Catalog total: 6 hours." in extra["notes"]


def test_one_course_under_a_colon_heading_is_required():
    g = program(parse("psychology-bslas-developmental-psychology", DEVP))["Developmental Psychology Core Course"]
    assert g["rule"] == "all" and len(g["courses"]) == 1


def test_one_of_and_hours_headings_and_names():
    g = program(parse("mechanical-engineering-bs", ME))
    sci = g["Science elective(s), chosen from one of the following"]
    assert (sci["rule"], sci["n"]) == ("n_of", 1)
    assert sci["courses"] == ["CHEM 104 + CHEM 105", "MCB 150", "PHYS 213 + PHYS 214"]
    assert g["Statistics elective, one course chosen from"]["courses"] == ["IE 300", "STAT 400"]
    tech = g["Technical electives chosen from the departmentally approved list below"]
    assert (tech["rule"], tech["hours"]) == ("hours", 6) and len(tech["courses"]) > 400
    # a rule heading names its own group instead of inheriting "Statistics elective..." from above
    assert "MechSE electives chosen from the departmentally approved list below" in g


def test_concentrations_become_programs_and_the_main_page_stays():
    base = "https://catalog.illinois.edu/undergraduate/las/"
    psyc, engl = f"{base}psychology-bslas/", f"{base}english-balas/"
    req = b'<div id="degreerequirementstextcontainer"></div>'
    pages = {psyc: req + b'<a href="/undergraduate/las/psychology-bslas/social-psychology/">s</a>'
                     b'<a href="/undergraduate/las/psychology-bslas/old-option/">o</a>',
             engl: b'<a href="/undergraduate/las/english-balas/english-teaching/">t</a>'}
    subs = {f"{psyc}social-psychology/": req, f"{psyc}old-option/": b"no requirements here",
            f"{engl}english-teaching/": req}
    urls = catalog_import.with_concentrations([psyc, engl], pages, lambda us: {u: subs[u] for u in us})
    assert urls == [psyc, f"{psyc}social-psychology/", f"{engl}english-teaching/"]
    assert catalog_import.program_id(f"{base}animal-sciences-bs/science-pre-veterinary--medical/") \
        == "animal-sciences-bs-science-pre-veterinary-medical"


def test_an_unchanged_reimport_keeps_the_file_and_its_date(tmp_path):
    doc = parse("accountancy-bs", ACCY)
    assert catalog_import.write(doc, tmp_path) is True
    before = (tmp_path / "accountancy-bs.yaml").read_text(encoding="utf-8")
    assert catalog_import.write({**doc, "read_on": "2026-12-01", "generated": "2026-12-01"}, tmp_path) is False
    assert (tmp_path / "accountancy-bs.yaml").read_text(encoding="utf-8") == before
    changed = {**doc, "total_hours": 125, "read_on": "2026-12-01", "generated": "2026-12-01"}
    assert catalog_import.write(changed, tmp_path) is True


def test_a_reimport_keeps_a_minors_hand_added_overlap_rule(tmp_path):
    doc = {**parse("accountancy-bs", ACCY), "id": "test-minor", "type": "minor"}
    assert catalog_import.write(doc, tmp_path) is True
    path = tmp_path / "test-minor.yaml"
    rule = {"distinct_hours": 6, "min_level": 300, "quote": "q", "source": "https://catalog.illinois.edu/x/"}
    old = yaml.safe_load(path.read_text(encoding="utf-8"))
    path.write_text(yaml.safe_dump({**old, "major_overlap": [rule]}, sort_keys=False), encoding="utf-8")
    # the same page again: nothing to write; a changed page: rewritten, the rule kept
    assert catalog_import.write({**doc, "read_on": "2026-12-01", "generated": "2026-12-01"}, tmp_path) is False
    assert catalog_import.write({**doc, "total_hours": 21, "generated": "2026-12-01"}, tmp_path) is True
    again = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert again["major_overlap"] == [rule] and again["total_hours"] == 21
    assert list(again).index("major_overlap") < list(again).index("groups")


def test_a_reimport_keeps_not_open_rules_and_authored_group_notes(tmp_path):
    doc = {**parse("accountancy-bs", ACCY), "id": "test-minor", "type": "minor"}
    assert catalog_import.write(doc, tmp_path) is True
    path = tmp_path / "test-minor.yaml"
    rule = {"majors": ["advertising-bs"], "quote": "Not open to this major.",
            "source": "https://catalog.illinois.edu/undergraduate/media/minors/advertising/"}
    old = yaml.safe_load(path.read_text(encoding="utf-8"))
    old["not_open_to"] = [rule]
    old["groups"][0]["notes"] = ["Only applies to this option."]
    old["groups"][0]["source"] = rule["source"]
    path.write_text(yaml.safe_dump(old, sort_keys=False), encoding="utf-8")
    changed = {**doc, "total_hours": 21, "generated": "2026-12-01"}
    assert catalog_import.write(changed, tmp_path) is True
    again = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert again["not_open_to"] == [rule]
    assert again["groups"][0]["notes"] == ["Only applies to this option."]
    assert again["groups"][0]["source"] == rule["source"]


def test_the_hand_checked_majors_are_protected_and_valid():
    from pipeline.config import DATA

    for pid in ("computer-science-bs", "economics-balas", "finance-bs", "accountancy-bs", "mechanical-engineering-bs",
                "psychology-bslas"):
        text = (DATA / "degrees" / f"{pid}.yaml").read_text(encoding="utf-8")
        assert "generated:" not in text and "Checked by hand against https://catalog.illinois.edu/" in text, pid
        validate(yaml.safe_load(text), pid)


def test_certificates_stop_at_the_graduate_list_and_validate():
    page = ('<h2>LAS undergraduate certificate programs</h2><a href="http://x.illinois.edu/c#frag">'
            '<h3>Teaching of English as a Second Language (TESL)</h3></a><h2>LAS graduate certificate programs</h2><a href="https://y.illinois.edu/">'
            'Grad Only</a>')
    links = catalog_import.certificate_links(page)
    assert links == [("Teaching of English as a Second Language (TESL)", "https://x.illinois.edu/c")]
    doc = catalog_import.certificate_doc(*links[0], "2026-11-23")
    assert doc["id"] == "teaching-english-as-a-second-language-certificate"
    d = validate(yaml.safe_load(yaml.safe_dump(doc)), doc["id"])
    assert d.type == "certificate" and d.groups[0].rule == "manual"


def test_index_links_take_joint_college_and_academic_units_programs():
    index = (FIXTURES / "catalog" / "undergraduate-index.html").read_bytes()
    links = catalog_import.program_links(index)
    base = "https://catalog.illinois.edu/undergraduate/"
    for u in ("eng_las/statistics-computer-science-bslas/", "eng_las/mathematics-computer-science-bslas/",
              "eng_media/computer-science-advertising-bs/", "eng_faa/computer-science-music-bs/",
              "eng_aces/agricultural-biological-engineering-bs/", "ahs_faa/dance-ba-kinesiology-bs/",
              "las/academic-units/stats/statistics-major/", "bus/accountancy-bs/"):
        assert f"{base}{u}" in links
    assert not [u for u in links if re.search(r"undeclared|individual-plans", u)]
    assert f"{base}las/academic-units/" not in links and f"{base}minors/" not in links
    found, skipped = catalog_import.index_links(index)
    reasons = dict(skipped)
    assert reasons[f"{base}las/individual-plans-study/"] == "individual plan of study"
    assert reasons[f"{base}bus/business-undeclared/"] == "undeclared"
    assert reasons[f"{base}eng_aces/agricultural-biological-engineering-bs/synthetic-biological-engineering/"] \
        .startswith("concentration")
    assert not set(found) & {u for u, _ in skipped}


def test_joint_and_unit_program_ids_drop_the_college_and_unit():
    base = "https://catalog.illinois.edu/undergraduate/"
    assert catalog_import.program_id(f"{base}eng_las/statistics-computer-science-bslas/") \
        == "statistics-computer-science-bslas"
    assert catalog_import.program_id(f"{base}las/academic-units/stats/statistics-major/") == "statistics-major"
    abe = f"{base}eng_aces/agricultural-biological-engineering-bs/"
    assert catalog_import.program_id(f"{abe}soil-water-resources-engineering/") \
        == "agricultural-biological-engineering-bs-soil-water-resources-engineering"


def test_a_requirements_tab_without_degree_in_its_id():
    doc = parse("music-composition-bmus", "https://catalog.illinois.edu/undergraduate/faa/music-composition-bmus/")
    assert doc["id"] == "music-composition-bmus" and doc["total_hours"] == 120
    assert any(g.get("kind") != "gened" for g in doc["groups"])
