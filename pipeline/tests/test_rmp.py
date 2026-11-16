import json

import httpx
import pytest

from pipeline import rmp
from pipeline.config import FIXTURES
from pipeline.names import parse_name

SCHOOL = json.loads((FIXTURES / "rmp" / "HANDMADE_school_search.json").read_text())
TEACHERS = json.loads((FIXTURES / "rmp" / "HANDMADE_teacher_search.json").read_text())


def transport(calls):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body)
        assert request.headers["User-Agent"].startswith("illini-scheduler")
        if "schools" in body["query"]:
            return httpx.Response(200, json=SCHOOL)
        assert body["variables"]["query"]["schoolID"] == "U2Nob29sLTEyMzQ="
        return httpx.Response(200, json=TEACHERS)
    return httpx.MockTransport(handler)


def test_school_lookup_by_search_not_hardcoded(tmp_path):
    calls = []
    c = rmp.RmpClient(tmp_path, transport=transport(calls), delay=0)
    assert c.find_school() == "U2Nob29sLTEyMzQ="


def test_lookup_parses_and_trims(tmp_path):
    c = rmp.RmpClient(tmp_path, transport=transport([]), delay=0)
    t = c.lookup("Example, T", "CS")
    assert t is not None and t.rmp_id == "111" and t.num_ratings == 40
    assert t.top_tags[0] == "Amazing lectures"
    assert len(t.reviews) == 3 and all(len(r["text"]) <= 200 for r in t.reviews)
    assert t.reviews[0]["date"] == "2026-05-01"  # newest first, blank comments dropped
    assert t.url.endswith("/111")


def test_cache_prevents_second_request(tmp_path):
    calls = []
    c = rmp.RmpClient(tmp_path, transport=transport(calls), delay=0)
    c.lookup("Example, T", "CS")
    n = len(calls)
    c2 = rmp.RmpClient(tmp_path, transport=transport(calls), delay=0)
    c2.lookup("Example, T", "CS")
    assert len(calls) == n


def test_department_must_be_plausible():
    teachers = [rmp.parse_teacher(e["node"]) for e in TEACHERS["data"]["newSearch"]["teachers"]["edges"]]
    assert rmp.choose_match(parse_name("Example, O"), "CS", teachers) is None  # 'Other' is in Music
    assert rmp.choose_match(parse_name("Example, T"), "CS", teachers).rmp_id == "111"
    # exact last name only: 'Exampleton' never matches 'Example'
    assert all(t.last_name == "Example" for t in teachers if rmp.choose_match(parse_name("Example, T"), "CS", [t]))


def test_initial_matching_two_people_is_not_guessed():
    a = rmp.RmpTeacher("1", "John", "Smith", "Mathematics", 4, 3, 50, 10)
    b = rmp.RmpTeacher("2", "Jane", "Smith", "Mathematics", 4, 3, 50, 10)
    assert rmp.choose_match(parse_name("Smith, J"), "MATH", [a, b]) is None
    assert rmp.choose_match(parse_name("Smith, Jane"), "MATH", [a, b]).rmp_id == "2"


def test_would_take_again_negative_means_unknown():
    t = rmp.parse_teacher(TEACHERS["data"]["newSearch"]["teachers"]["edges"][1]["node"])
    assert t.would_take_again_pct is None


def test_blocked_network_reports_unavailable(tmp_path):
    def handler(request):
        return httpx.Response(403, text="Forbidden")
    c = rmp.RmpClient(tmp_path, transport=httpx.MockTransport(handler), delay=0)
    with pytest.raises(rmp.RmpUnavailable):
        c.find_school()
    assert c.error and "403" in c.error


def test_disabled(tmp_path):
    c = rmp.RmpClient(tmp_path, enabled=False)
    with pytest.raises(rmp.RmpUnavailable):
        c.find_school()


def test_zero_ratings_is_no_data_not_a_bad_score():
    t = rmp.parse_teacher({"legacyId": 1, "firstName": "A", "lastName": "B", "department": "Chemistry",
                           "avgRating": 0, "avgDifficulty": 0, "wouldTakeAgainPercent": -1, "numRatings": 0})
    assert t.avg_rating is None and t.avg_difficulty is None and t.would_take_again_pct is None
    assert t.num_ratings == 0


def test_partial_graphql_error_is_skipped_and_not_cached(tmp_path):
    # Seen live: RMP's search backend refused one query; the answer had errors and `teachers: null`.
    bad = {"data": {"newSearch": {"teachers": None}}, "errors": [{"message": "connection refused"}]}
    calls = []

    def handler(request):
        body = json.loads(request.content)
        calls.append(body)
        return httpx.Response(200, json=SCHOOL if "schools" in body["query"] else bad)
    c = rmp.RmpClient(tmp_path, transport=httpx.MockTransport(handler), delay=0)
    assert c.lookup("Cheslow, A", "CS") is None and c.error is None  # the run carries on
    assert c.lookup("Cheslow, A", "CS") is None
    assert sum("teachers" in b["query"] for b in calls) == 2  # retried, not served from cache


def test_compound_surname_on_rmp_matches():
    # Seen live: CS 173's "Gonzalez, Daniel" is "Daniel Gonzalez Cedre" (Computer Science) on RMP.
    daniel = rmp.RmpTeacher("1", "Daniel", "Gonzalez Cedre", "Computer Science", 4.1, 3.0, 80, 18)
    joseph = rmp.RmpTeacher("2", "Joseph", "Gonzalez", "Engineering", 4, 3, 50, 2)
    spanish = rmp.RmpTeacher("3", "Daniel", "Gonzalez Ruiz", "Spanish", 4, 3, 50, 9)
    assert rmp.choose_match(parse_name("Gonzalez, Daniel"), "CS", [joseph, daniel, spanish]).rmp_id == "1"
    assert rmp.same_surname("gonzalez", "Gonzalez-Cedre") and rmp.same_surname("gonzalezcedre", "Gonzalez Cedre")
    assert not rmp.same_surname("cedre", "Gonzalez Cedre")  # only the first part of a compound surname
    assert not rmp.same_surname("gonz", "Gonzalez")


def test_truncated_gpa_surname_still_matches_the_full_rmp_name():
    wade = rmp.RmpTeacher("9", "Wade", "Fagen-Ulmschneider", "Computer Science", 4.5, 3, 90, 50)
    assert rmp.choose_match(parse_name("Fagen-Ulmschnei, Wade"), "CS", [wade]).rmp_id == "9"
