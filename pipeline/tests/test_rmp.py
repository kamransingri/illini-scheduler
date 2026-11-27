import json
import os
import time
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from pipeline import rmp
from pipeline.config import FIXTURES
from pipeline.names import parse_name

# Real RMP answers saved by `python -m pipeline.fetch_fixtures` (fixtures/README.md).
SCHOOL = json.loads((FIXTURES / "rmp" / "school_search.json").read_text(encoding="utf-8"))
SEARCHES = {name: json.loads((FIXTURES / "rmp" / f"teacher_search_{name.lower()}.json").read_text(encoding="utf-8"))
            for name in ("Challen", "Lewis")}
UIUC = "U2Nob29sLTExMTI="
EMPTY = {"data": {"newSearch": {"teachers": {"edges": []}}}}


def nodes(name):
    return [e["node"] for e in SEARCHES[name]["data"]["newSearch"]["teachers"]["edges"]]


def transport(calls):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body)
        assert request.headers["User-Agent"].startswith("illini-scheduler")
        if "schools" in body["query"]:
            return httpx.Response(200, json=SCHOOL)
        assert body["variables"]["query"]["schoolID"] == UIUC
        return httpx.Response(200, json=SEARCHES.get(body["variables"]["query"]["text"], EMPTY))
    return httpx.MockTransport(handler)


def test_school_lookup_by_search_not_hardcoded(tmp_path):
    calls = []
    c = rmp.RmpClient(tmp_path, transport=transport(calls), delay=0)
    assert c.find_school() == UIUC


def test_the_university_is_chosen_wherever_rmp_lists_it(tmp_path):
    # Seen live: the search also returns "UIC College of Medicine" with city Urbana-Champaign and the law school.
    edges = SCHOOL["data"]["newSearch"]["schools"]["edges"]
    for order in (edges[::-1], edges[2:] + edges[:2]):
        answer = {"data": {"newSearch": {"schools": {"edges": order}}}}
        c = rmp.RmpClient(tmp_path / str(len(order)) / order[0]["node"]["id"],
                          transport=httpx.MockTransport(lambda r, a=answer: httpx.Response(200, json=a)), delay=0)
        assert c.find_school() == UIUC


def test_lookup_parses_and_trims(tmp_path):
    c = rmp.RmpClient(tmp_path, transport=transport([]), delay=0)
    t = c.lookup("Challen, G", "CS")
    assert t is not None and (t.rmp_id, t.first_name, t.department, t.num_ratings) == (
        "2327680", "Geoffrey", "Computer Science", 211)
    node = nodes("Challen")[0]
    assert t.top_tags == []  # RMP now sends no rating tags for anyone (all 4,526 cached teachers, 2026-11-17)
    tagged = {**node, "teacherRatingTags": [{"tagName": f"t{i}", "tagCount": i} for i in range(7)]}
    assert rmp.parse_teacher(tagged).top_tags == ["t6", "t5", "t4", "t3", "t2"]  # the five most used, if it ever does
    assert len(t.reviews) == 20 and all(len(r["text"]) <= 200 for r in t.reviews)  # 11 of them were cut
    assert [r["date"] for r in t.reviews] == sorted((r["date"] for r in t.reviews), reverse=True)  # newest first
    assert t.url.endswith("/2327680")
    blank = {**node, "ratings": {"edges": [{"node": {"comment": "  ", "class": "CS124", "date": "2026-01-01"}}]}}
    assert rmp.parse_teacher(blank).reviews == []  # blank comments dropped


def test_cache_prevents_second_request(tmp_path):
    calls = []
    c = rmp.RmpClient(tmp_path, transport=transport(calls), delay=0)
    c.lookup("Challen, G", "CS")
    n = len(calls)
    c2 = rmp.RmpClient(tmp_path, transport=transport(calls), delay=0)
    c2.lookup("Challen, G", "CS")
    assert len(calls) == n


def test_department_must_be_plausible():
    teachers = [rmp.parse_teacher(n) for n in nodes("Lewis")]  # Colleen (Computer Science), Alesha (East Asian Studies)
    assert rmp.choose_match(parse_name("Lewis, C"), "CS", teachers).rmp_id == "2774362"
    assert rmp.choose_match(parse_name("Lewis, A"), "CS", teachers) is None
    assert rmp.choose_match(parse_name("Lewis, A"), "EALC", teachers).rmp_id == "2981003"
    # the same surname only: "Lewisohn" never matches "Lewis"
    lewisohn = rmp.RmpTeacher("9", "Colleen", "Lewisohn", "Computer Science", 4, 3, 50, 10)
    assert rmp.choose_match(parse_name("Lewis, C"), "CS", [lewisohn]) is None


def test_initial_matching_two_people_is_not_guessed():
    a = rmp.RmpTeacher("1", "John", "Smith", "Mathematics", 4, 3, 50, 10)
    b = rmp.RmpTeacher("2", "Jane", "Smith", "Mathematics", 4, 3, 50, 10)
    assert rmp.choose_match(parse_name("Smith, J"), "MATH", [a, b]) is None
    assert rmp.choose_match(parse_name("Smith, Jane"), "MATH", [a, b]).rmp_id == "2"


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
    # Alesha Lewis has no ratings: RMP sends avgRating 0 and wouldTakeAgainPercent -1, which mean "no data".
    node = next(n for n in nodes("Lewis") if n["numRatings"] == 0)
    assert node["avgRating"] == 0 and node["wouldTakeAgainPercent"] == -1
    t = rmp.parse_teacher(node)
    assert t.avg_rating is None and t.avg_difficulty is None and t.would_take_again_pct is None
    assert t.num_ratings == 0 and t.reviews == []


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


def _t(rid, first, last, dept, n=10, courses=()):
    reviews = [{"text": "ok", "course": c, "date": "2026-01-01"} for c in courses]
    return rmp.RmpTeacher(rid, first, last, dept, 4.0, 3.0, 50, n, reviews=reviews)


def _age(path, days):
    when = time.time() - days * 86400
    for f in path.glob("*.json"):
        os.utime(f, (when, when))


def test_any_subject_they_teach_can_vouch_for_the_department():
    # Before, only the alphabetically first subject was checked: CHEM rejected a Computer Science profile.
    zhang = _t("1", "Jing", "Zhang", "Computer Science")
    assert rmp.choose_match(parse_name("Zhang, Jing"), {"CHEM", "CS"}, [zhang]).rmp_id == "1"
    assert rmp.choose_match(parse_name("Zhang, Jing"), {"CHEM"}, [zhang]) is None


def test_nicknames_middle_names_and_spellings_need_evidence():
    # Seen live: MATH 220's Robert Murphy is "Bob Murphy" on RMP (Mathematics, 186 ratings).
    bob = _t("1", "Bob", "Murphy", "Mathematics", 186, ["MATH220"])
    assert rmp.choose_match(parse_name("Murphy, Robert"), "MATH", [bob], {"MATH220"}).rmp_id == "1"
    # In a subject without a department list, a nickname needs a review for one of their subjects.
    sandy = _t("2", "Sandy", "Kopels", "Social Work", 12)
    assert rmp.choose_match(parse_name("Kopels, Sandra"), "SOCW", [sandy]) is None
    sandy.reviews = [{"text": "ok", "course": "SOCW589", "date": "2026-01-01"}]
    assert rmp.choose_match(parse_name("Kopels, Sandra"), "SOCW", [sandy], {"SOCW589"}).rmp_id == "2"
    # One letter apart, and a middle name RMP lists first.
    eliz = _t("3", "Elizabeth", "Bigsby", "Communication", 10, ["CMN345"])
    assert rmp.choose_match(parse_name("Bigsby, Elisabeth"), "CMN", [eliz], {"CMN345"}).rmp_id == "3"
    lee = _t("4", "Robert Lee", "Deville", "Mathematics", 34, ["MATH416"])
    assert rmp.choose_match(parse_name("DeVille, Lee"), "MATH", [lee], {"MATH416"}).rmp_id == "4"
    # A different given name is a different person, even on the same course (seen live: ACCY 312).
    michelle = _t("5", "Michelle", "Hutchens", "Accounting", 2, ["ACCY312"])
    assert rmp.choose_match(parse_name("Hutchens, Matthew"), "ACCY", [michelle], {"ACCY312"}) is None
    assert rmp.choose_match(parse_name("Kemper, Kim"), "MCB", [_t("6", "Jongsook", "Kemper", "Biochem", 1, ["MCB465"])],
                            {"MCB465"}) is None


def test_a_review_for_their_own_course_picks_between_people_with_one_initial():
    sang = _t("1", "Sang", "Lee", "Art", 7, ["ARTD218"])
    sarah = _t("2", "Sarah", "Lee", "Art", 30, ["ARTD101"])
    assert rmp.choose_match(parse_name("Lee, S"), "ARTD", [sang, sarah], {"ARTD218"}).rmp_id == "1"
    assert rmp.choose_match(parse_name("Lee, S"), "ARTD", [sang, sarah], {"ARTD300"}) is None  # nothing decides


def test_a_profile_shows_only_on_subjects_it_fits():
    # Seen live: Course Explorer's "Anderson, J" is two people. James Anderson (Education; reviews for AFRO 310 and
    # EPS 310) teaches EPOL 552, and his reviews were showing on MATH 221, taught by another J. Anderson.
    reviews = [{"text": "x", "course": "AFRO310", "date": ""}, {"text": "y", "course": "EPS310", "date": ""}]
    assert rmp.fits_subject("EPOL", "Education", reviews)
    assert not rmp.fits_subject("MATH", "Education", reviews)
    assert rmp.fits_subject("MATH", "Education", reviews + [{"text": "z", "course": "math 221", "date": ""}])
    assert rmp.course_code("CS-124") == "CS124" and rmp.course_code("Intro") == ""


def test_full_name_search_when_the_surname_fills_a_page(tmp_path):
    others = [{"node": {"legacyId": 100 + i, "firstName": f"Other{i}", "lastName": "Lee", "department": "Physics",
                        "numRatings": 1}} for i in range(20)]
    amy = {"node": {"legacyId": 7, "firstName": "Amy", "lastName": "Lee", "department": "English", "numRatings": 5}}
    texts = []

    def handler(request):
        body = json.loads(request.content)
        if "schools" in body["query"]:
            return httpx.Response(200, json=SCHOOL)
        texts.append(body["variables"]["query"]["text"])
        edges = [amy] if texts[-1] == "amy Lee" else others
        return httpx.Response(200, json={"data": {"newSearch": {"teachers": {"edges": edges}}}})

    c = rmp.RmpClient(tmp_path, transport=httpx.MockTransport(handler), delay=0)
    assert c.lookup("Lee, Amy", "ENGL").rmp_id == "7"
    assert texts == ["Lee", "amy Lee"]


def test_older_answers_are_used_after_the_budget_and_refreshed_before_it(tmp_path):
    calls = []
    rmp.RmpClient(tmp_path, transport=transport(calls), delay=0).lookup("Challen, G", "CS")
    _age(tmp_path, 30)  # past CACHE_DAYS, inside STALE_DAYS
    offline = rmp.RmpClient(tmp_path, enabled=False)  # what the loop switches to once the budget is spent
    t = offline.lookup("Challen, G", "CS")
    week_ago = (datetime.now(UTC) - timedelta(days=7)).isoformat()
    assert t is not None and t.rmp_id == "2327680" and t.fetched_at < week_ago  # the cache's date, not today
    n = len(calls)
    rmp.RmpClient(tmp_path, transport=transport(calls), delay=0).lookup("Challen, G", "CS")
    assert len(calls) > n  # with budget left, a 30-day-old answer is asked again
    _age(tmp_path, 120)  # past STALE_DAYS: too old to show
    with pytest.raises(rmp.RmpUnavailable):
        rmp.RmpClient(tmp_path, enabled=False).lookup("Challen, G", "CS")


def test_rmp_failing_mid_run_falls_back_to_older_answers(tmp_path):
    rmp.RmpClient(tmp_path, transport=transport([]), delay=0).lookup("Challen, G", "CS")
    _age(tmp_path, 10)
    down = rmp.RmpClient(tmp_path, transport=httpx.MockTransport(lambda r: httpx.Response(503)), delay=0)
    assert down.lookup("Challen, G", "CS").rmp_id == "2327680"
    assert down.error and "503" in down.error


def test_a_two_part_surname_is_found_under_one_part(tmp_path):
    # RMP lists Course Explorer's "Fagen-Ulmschneider, W" (GPA dataset: "Fagen-Ulmschnei, Wade") as "Wade Fagen"
    wade = {"node": {"legacyId": 1234, "firstName": "Wade", "lastName": "Fagen", "department": "Computer Science",
                     "numRatings": 79}}
    texts = []

    def handler(request):
        body = json.loads(request.content)
        if "schools" in body["query"]:
            return httpx.Response(200, json=SCHOOL)
        texts.append(body["variables"]["query"]["text"])
        edges = [wade] if texts[-1] == "Fagen" else []
        return httpx.Response(200, json={"data": {"newSearch": {"teachers": {"edges": edges}}}})

    c = rmp.RmpClient(tmp_path, transport=httpx.MockTransport(handler), delay=0)
    assert c.lookup("Fagen-Ulmschnei, Wade", "CS").rmp_id == "1234"
    assert texts == ["Fagen-Ulmschnei", "Fagen"]
    assert c.lookup("Fagen-Ulmschneider, W", {"CS", "STAT"}).rmp_id == "1234"
    # the given name and the department still have to fit
    assert c.lookup("Fagen-Ulmschneider, Joe", "CS") is None
    assert c.lookup("Fagen-Ulmschneider, Wade", "ENGL") is None
    # a one-part surname isn't searched again
    texts.clear()
    assert c.lookup("Smith, Wade", "CS") is None and texts == ["Smith"]
