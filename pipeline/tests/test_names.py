import pytest

from pipeline.names import InstructorMatcher, compatible, instructor_key, parse_name, term_order


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
