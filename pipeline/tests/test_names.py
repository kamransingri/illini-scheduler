import pytest

from pipeline.names import (
    InstructorMatcher,
    alias_key,
    compatible,
    cross_listings,
    instructor_key,
    load_overrides,
    parse_name,
    term_order,
)


def k(raw):
    p = parse_name(raw)
    return instructor_key(p) if p else None


@pytest.mark.parametrize("raw,key", [
    ("Erickson, Jeff G", "erickson|jeff"),
    ("Erickson, J", "erickson|j"),
    ("Jeff Erickson", "erickson|jeff"),
    ("Jeff G. Erickson", "erickson|jeff"),
    ("Fagen-Ulmschneider, Wade A", "fagenulmschneider|wade"),
    ("Fagen-Ulmschnei, Wade A", "fagenulmschnei|wade"),
    ("de la Garza Val, José A", "delagarzaval|jose"),
    ("O'Brien, Kevin", "obrien|kevin"),
    ("Müller, Jürgen", "muller|jurgen"),
    ("Smith Jr., John", "smith|john"),
    ("Lewis, C", "lewis|c"),
    ("Ur Rahman, S", "urrahman|s"),
    ("Vishnukumar Sarmini, s", "vishnukumarsarmini|s"),
    ("CHEN, ERIC C", "chen|eric"),
])
def test_keys(raw, key):
    assert k(raw) == key


@pytest.mark.parametrize("raw", ["", "   ", "TBA", "Staff"])
def test_blank(raw):
    assert parse_name(raw) is None


def test_display():
    assert parse_name("Erickson, Jeff G").display == "Jeff Erickson"
    assert parse_name("Erickson, J").display == "J. Erickson"
    assert parse_name("Driggs-Campbell, Katherin").display == "K. Driggs-Campbell"  # clipped at 25 chars


def test_initial_vs_full_compatible():
    assert compatible(parse_name("Erickson, J"), parse_name("Erickson, Jeff G"))
    assert compatible(parse_name("Jeffrey Erickson"), parse_name("Erickson, Jeff"))
    assert not compatible(parse_name("Erickson, K"), parse_name("Erickson, Jeff G"))
    assert not compatible(parse_name("Erikson, J"), parse_name("Erickson, Jeff"))


def test_truncated_last_name():
    assert compatible(parse_name("Fagen-Ulmschneider, W"), parse_name("Fagen-Ulmschnei, Wade A"))
    assert compatible(parse_name("de la Garza Valenzuela, J"), parse_name("de la Garza Val, José A"))
    # not truncated (short) -> no prefix matching
    assert not compatible(parse_name("Kimball, J"), parse_name("Kim, John"))


def test_hyphenated_vs_spaced():
    assert k("Lawson-Bulten, E") == k("Lawson Bulten, E")


def _matcher():
    m = InstructorMatcher()
    m.add("Erickson, Jeff G", "CS", "374", "2025-fa")
    m.add("Smith, John A", "MATH", "221", "2023-fa")
    m.add("Smith, Jane B", "MATH", "231", "2025-sp")
    m.add("Smith, Jane B", "MATH", "221", "2021-fa")
    m.add("Lee, Sam", "STAT", "100", "2024-sp")
    m.add("Lee, Sara", "STAT", "200", "2024-sp")
    m.add("Zilles, Craig", "CS", "233", "2025-sp")
    return m


def test_simple_match():
    assert _matcher().match("Erickson, J", "CS", "374") == ("erickson|jeff", "subject")


def test_same_last_name_same_department_prefers_recent_teacher_of_course():
    # Both Smiths are 'J' in MATH; John taught MATH 221 more recently than Jane did.
    assert _matcher().match("Smith, J", "MATH", "221") == ("smith|john", "recent-course")
    assert _matcher().match("Smith, J", "MATH", "231") == ("smith|jane", "recent-course")


def test_ambiguous_is_logged_not_linked():
    m = _matcher()
    key, method = m.match("Lee, S", "STAT", "410")
    assert key is None and method == "ambiguous"
    assert m.unmatched and m.unmatched[0]["raw_name"] == "Lee, S"


def test_initials_only_unknown_person():
    m = _matcher()
    assert m.match("Nobody, Q", "CS", "100")[0] is None


def test_cross_listed_global_unique():
    assert _matcher().match("Zilles, C", "ECE", "233") == ("zilles|craig", "global-unique")


def test_override():
    m = InstructorMatcher({("STAT", "Lee, S"): "lee|sara"})
    assert m.match("Lee, S", "STAT", "410") == ("lee|sara", "override")


def test_full_name_match_disambiguates():
    assert _matcher().match("Lee, Sara", "STAT", "410") == ("lee|sara", "subject")


def test_term_order():
    assert term_order("2026-fa") > term_order("2026-su") > term_order("2026-sp") > term_order("2026-wi")
    assert term_order("") == 0


def test_write_unmatched(tmp_path):
    m = _matcher()
    m.match("Lee, S", "STAT", "410", "2027-sp")
    m.match("Lee, S", "STAT", "410", "2027-sp")
    assert m.write_unmatched(tmp_path / "u.csv") == 1


# ---- #12: cross-listings, every course of a name, two people under one name -------------------------------------

def test_cross_listings_from_the_catalog():
    x = cross_listings([("MATH", "464", "Probability theory. Same as STAT 410. 4 hours."),
                        ("ASRM", "401", "Same as STAT 408 and FIN 408."), ("CS", "124", "No twin.")])
    assert x[("MATH", "464")] == [("STAT", "410")] and x[("STAT", "410")] == [("MATH", "464")]
    assert x[("ASRM", "401")] == [("FIN", "408"), ("STAT", "408")] and ("CS", "124") not in x


def _cross_matcher():
    m = InstructorMatcher()
    m.add("Stepanov, Alexei G", "STAT", "410", "2011-su")  # the same person spelled two ways over the years
    m.add("Stepanov, Alexey G", "STAT", "410", "2026-sp")
    m.add("Stepanov, Anna", "CHEM", "102", "2025-fa")
    return m


def test_a_cross_listed_twin_picks_who_taught_it_most_recently():
    m = _cross_matcher()
    assert m.match("Stepanov, A", "MATH", "464")[1] == "unmatched"  # three Stepanov, A across subjects
    assert m.match("Stepanov, A", "MATH", "464", cross=[("STAT", "410")]) == ("stepanov|alexey", "cross-listed")
    assert m.match("Stepanov, A", "MATH", "465", cross=[("STAT", "999")])[1] == "unmatched"


def test_every_course_of_a_name_counts_not_only_the_first():
    m = InstructorMatcher()
    m.add("Wang, Shiyu", "STAT", "200", "2014-fa")
    m.add("Wang, Shulei", "STAT", "428", "2026-sp")
    # STAT 578: neither taught it; STAT 428: only Shulei did, so both courses are Shulei's
    got = m.match_courses("Wang, S", "STAT", [("578", "2026-fa"), ("428", "2027-sp")])
    assert got == {"578": ("wang|shulei", "recent-course"), "428": ("wang|shulei", "recent-course")}
    assert m.unmatched == []


def test_one_name_two_people_links_each_course_on_its_own():
    m = InstructorMatcher()
    m.add("Li, Hanping", "HIST", "100", "2022-fa")
    m.add("Li, Hanping", "HIST", "120", "2021-fa")
    m.add("Li, Haiyi", "HIST", "120", "2025-sp")
    got = m.match_courses("Li, H", "HIST", [("120", "2027-sp"), ("100", "2026-fa"), ("495", "2027-sp")])
    assert got["120"] == ("li|haiyi", "recent-course") and got["100"] == ("li|hanping", "recent-course")
    assert got["495"] == (None, "ambiguous")  # can't tell which of the two
    assert [u["number"] for u in m.unmatched] == ["495"] and "different people" in m.unmatched[0]["reason"]


def test_course_only_evidence_does_not_spread_to_the_names_other_courses():
    m = InstructorMatcher()
    m.add("Williams, Craig A", "CLCV", "240", "2025-sp")
    m.add("Williams, Cynthia A", "LAW", "603", "2025-sp")
    got = m.match_courses("Williams, C", "GWS", [("240", "2027-sp"), ("202", "2027-sp")],
                          {("GWS", "240"): [("CLCV", "240")]})
    assert got["240"] == ("williams|craig", "cross-listed")
    assert got["202"] == (None, "unmatched")  # GWS 202 says nothing about who teaches it


def test_unlog_and_alias_lookup():
    m = InstructorMatcher()
    m.match("Nobody, Q", "CS", "100", "2027-sp")
    m.unlog("Nobody, Q", "CS", "100")
    assert m.unmatched == []
    aliases = {("Li, H", "HIST", "120"): "li|haiyi", ("Li, H", "HIST", ""): "li|hanping"}
    assert alias_key(aliases, "Li, H", "HIST", "120") == "li|haiyi"
    assert alias_key(aliases, "Li, H", "HIST", "100") == "li|hanping"
    assert alias_key(aliases, "Li, H", "EALC", "120") is None


def test_overrides_must_cite_a_source(tmp_path):
    p = tmp_path / "o.csv"
    p.write_text('subject,raw_name,instructor_key,source\n# comment,,,\n'
                 'STAT,"Lee, S",lee|sara,"dept page (read 2026-11-18)"\n', encoding="utf-8")
    assert load_overrides(p) == {("STAT", "Lee, S"): "lee|sara"}
    p.write_text('subject,raw_name,instructor_key,source\nSTAT,"Lee, S",lee|sara,\n', encoding="utf-8")
    with pytest.raises(ValueError, match="without a source: STAT Lee, S"):
        load_overrides(p)


def test_the_real_overrides_file_loads():
    from pipeline.config import DATA

    load_overrides(DATA / "name_overrides.csv")
