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
