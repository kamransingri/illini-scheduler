"""#14: r/UIUC signal. Attribution, extraction checks, aggregation and collection, all offline."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from pipeline import reddit
from pipeline.reddit import Context, Mention, aggregate, attribute, find_courses, names_surname, verify

NOW = datetime(2026, 11, 18, tzinfo=UTC)
YEAR = 365.25 * 86400


def ctx() -> Context:
    c = Context(
        courses={("CS", "225"): "Data Structures", ("CS", "124"): "Intro to CS I", ("MATH", "231"): "Calculus II",
                 ("MATH", "221"): "Calculus I", ("MATH", "220"): "Calculus", ("STAT", "107"): "Data Science"},
        aliases={"calc 2": ("MATH", "231"), "data structures": ("CS", "225")},
    )
    c.teachers = {
        ("CS", "225"): {"evans|carl": ("evans", "Evans"), "fagenulmschneider|wade": ("fagenulmschneider",
                                                                                   "Fagen-Ulmschneider")},
        ("CS", "124"): {"challen|geoffrey": ("challen", "Challen")},
        ("MATH", "231"): {"long|amy": ("long", "Long"), "lee|sam": ("lee", "Lee"), "lee|sara": ("lee", "Lee")},
    }
    c.names = {"challen|geoffrey": "Geoffrey Challen", "evans|carl": "Carl Evans"}
    return c


def thread(title="", text="", comments=(), tid="t1"):
    return {"id": tid, "title": title, "text": text, "created": NOW.timestamp() - YEAR, "score": 3,
            "permalink": f"/r/UIUC/comments/{tid}/x/", "author": "a0", "num_comments": len(comments),
            "comments": [{"id": f"c{i}", "body": b, "created": NOW.timestamp() - YEAR, "score": 1, "author": f"a{i}",
                          "permalink": f"/r/UIUC/comments/{tid}/x/c{i}/"} for i, b in enumerate(comments)]}


# ---- attribution ---------------------------------------------------------------------------------------------------

def test_the_sites_nicknames_are_read_from_search_ts():
    aliases = reddit.load_aliases()
    assert aliases["calc 2"] == ["MATH 231"] and aliases["calc 1"] == ["MATH 221", "MATH 220"]


def test_course_codes_nicknames_and_bare_numbers():
    c = ctx()
    assert find_courses("took cs225 and CS 124, also CS-225", c) == [("CS", "225"), ("CS", "124")]
    assert find_courses("calc 2 was rough", c) == [("MATH", "231")]
    assert find_courses("calc 1 was rough", c) == []  # "calc 1" could be MATH 220 or 221: not a nickname here
    assert find_courses("225 was fine", c) == []  # a bare number needs a thread about one subject
    assert find_courses("225 was fine, paid $124 for 225%", c, {"CS"}) == [("CS", "225")]
    assert find_courses("CS 999 and FAKE 101", c) == []  # only courses that exist


def test_a_surname_alone_never_matches():
    ms = attribute(thread("Who should I take?", "", ["Challen is amazing", "Lee was great"]), ctx())
    assert ms == []  # no course named in the comment or the thread


def test_professors_match_only_among_the_courses_teachers():
    t = thread("CS 124 with Challen?", "", ["Challen is amazing, take it", "Evans is great too", "it was ok"])
    ms = {(m.comment, m.course, m.prof) for m in attribute(t, ctx())}
    assert ("c0", "CS 124", "challen|geoffrey") in ms
    assert ("c1", "CS 124", None) in ms  # Evans teaches CS 225, not the thread's CS 124
    assert ("c2", "CS 124", None) in ms
    m = next(m for m in attribute(t, ctx()) if m.prof)
    assert m.sentence == "Challen is amazing, take it" and m.permalink.endswith("/c0/")


def test_ambiguous_and_common_word_surnames():
    t = thread("calc 2 profs", "", ["Lee is the best", "long homework every week", "Long explains well",
                                     "fagen-ulmschneider? wrong course"])
    ms = {(m.comment, m.prof) for m in attribute(t, ctx())}
    assert ("c0", None) in ms  # two Lees teach MATH 231
    assert ("c1", None) in ms  # "long" is not Professor Long
    assert ("c2", "long|amy") in ms
    assert names_surname("fagen-ulmschneider is great", "fagenulmschneider", "Fagen-Ulmschneider")
    assert not names_surname("li is fine", "li", "Li") and names_surname("Li is fine", "li", "Li")
    # the GPA dataset cuts last names at 15 characters
    assert names_surname("Fagen-Ulmschneider is great", "fagenulmschnei", "Fagen-Ulmschnei")
    assert not names_surname("Fagen is great", "fagenulmschnei", "Fagen-Ulmschnei")


def test_a_schedule_list_says_nothing_about_each_course():
    t = thread("rate my schedule", "", ["CS 124, CS 225, MATH 231 and STAT 107 next sem"])
    assert attribute(t, ctx()) == []


def test_the_post_itself_counts_and_its_course_carries_to_comments():
    t = thread("Data structures", "Evans made 225 fun", ["agreed"])
    ms = {(m.comment, m.course, m.prof) for m in attribute(t, ctx())}
    assert ms == {("t1", "CS 225", "evans|carl"), ("c0", "CS 225", None)}


# ---- extraction ----------------------------------------------------------------------------------------------------

def test_no_quote_no_number():
    text = "Challen is amazing. Exams are hard but fair. About 6 hours a week."
    got = verify({"about_teaching": True,
                  "teaching": {"value": 5, "quote": "Challen is  AMAZING."},
                  "difficulty": {"value": 4, "quote": "exams are brutal"},  # not in the comment
                  "hours_per_week": {"value": 6, "quote": "About 6 hours a week."},
                  "recommend": {"value": "unclear", "quote": None},
                  "exam_style": {"value": "hard but fair", "quote": "Exams are hard but fair."},
                  "curve": {"value": None, "quote": None}, "attendance": {"value": None, "quote": None}}, text)
    assert got["teaching"] == {"value": 5, "quote": "Challen is  AMAZING."}
    assert got["difficulty"] is None and got["recommend"] is None and got["curve"] is None
    assert got["hours_per_week"]["value"] == 6
    assert verify({"about_teaching": True, "teaching": {"value": 9, "quote": "Challen"}}, "Challen")["teaching"] is None
    off = verify({"about_teaching": False, "teaching": {"value": 5, "quote": "Challen"}}, "Challen")
    assert off["about_teaching"] is False and off["teaching"] is None


class FakeBatches:
    def __init__(self, answer):
        self.answer, self.sent, self.polls = answer, [], 0

    def create(self, requests):
        self.sent.append(requests)
        return SimpleNamespace(id="b1")

    def retrieve(self, _id):
        self.polls += 1
        return SimpleNamespace(processing_status="ended" if self.polls > 1 else "in_progress")

    def results(self, _id):
        for r in self.sent[-1]:
            yield self.answer(r)


def _ok(fields):
    def answer(r):
        msg = SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=json.dumps(fields))])
        return SimpleNamespace(custom_id=r["custom_id"], result=SimpleNamespace(type="succeeded", message=msg))
    return answer


def test_extract_sends_batches_once_and_keeps_verified_fields(tmp_path):
    t = thread("CS 124 with Challen?", "", ["Challen is amazing"])
    ms = attribute(t, ctx())
    fields = {"about_teaching": True, "teaching": {"value": 5, "quote": "Challen is amazing"}}
    batches = FakeBatches(_ok(fields))
    client = SimpleNamespace(messages=SimpleNamespace(batches=batches))
    store = tmp_path / "x.json"
    assert reddit.extract(ms, ctx(), store, client=client, sleep=lambda s: None) == {"sent": 1, "kept": 1,
                                                                                      "failed": 0}
    req = batches.sent[0][0]
    assert req["custom_id"] == "m0" and req["params"]["model"] == "claude-haiku-5-5"
    assert req["params"]["output_config"]["format"]["type"] == "json_schema"
    assert "Professor named: Geoffrey Challen" in req["params"]["messages"][0]["content"]
    saved = json.loads(store.read_text(encoding="utf-8"))
    assert saved[ms[0].id]["teaching"]["value"] == 5
    # nothing new: nothing sent
    assert reddit.extract(ms, ctx(), store, client=client, sleep=lambda s: None)["sent"] == 0


def test_a_refusal_is_retried_next_run(tmp_path):
    ms = attribute(thread("CS 124", "", ["it was fine"]), ctx())

    def refuse(r):
        msg = SimpleNamespace(stop_reason="refusal", content=[])
        return SimpleNamespace(custom_id=r["custom_id"], result=SimpleNamespace(type="succeeded", message=msg))

    client = SimpleNamespace(messages=SimpleNamespace(batches=FakeBatches(refuse)))
    assert reddit.extract(ms, ctx(), tmp_path / "x.json", client=client, sleep=lambda s: None)["failed"] == 1
    assert json.loads((tmp_path / "x.json").read_text(encoding="utf-8")) == {}


# ---- aggregation ---------------------------------------------------------------------------------------------------

def mention(i, course="CS 124", prof="challen|geoffrey", author=None, thread_id=None, years=0.0, score=0):
    return Mention(id=f"c{i}:{course}:{prof or ''}", thread=thread_id or f"t{i}", comment=f"c{i}", course=course,
                   prof=prof, text="x", sentence="x", created=NOW.timestamp() - years * YEAR, score=score,
                   author=author or f"a{i}", permalink=f"https://www.reddit.com/c{i}", thread_title="")


def rated(v, quote="good"):
    return {"about_teaching": True, "teaching": {"value": v, "quote": quote}, "difficulty": None,
            "hours_per_week": None, "recommend": {"value": "yes", "quote": "take it"}, "curve": None,
            "attendance": None, "exam_style": None}


def test_three_comment_floor_and_one_author_per_thread():
    ms = [mention(1), mention(2, author="same", thread_id="tx"), mention(3, author="same", thread_id="tx")]
    ex = {m.id: rated(5) for m in ms}
    p = aggregate(ms, ex, NOW)["courses"]["CS 124"]["profs"]["challen|geoffrey"]
    assert p["n"] == 2 and p["teaching"] is None  # the same author twice in one thread counts once; 2 < 3
    ms.append(mention(4))
    ex[ms[-1].id] = rated(5)
    p = aggregate(ms, ex, NOW)["courses"]["CS 124"]["profs"]["challen|geoffrey"]
    assert p["n_rated"] == 3 and p["teaching"] is not None
    assert p["recommend"] == {"yes": 3, "no": 0} and len(p["quotes"]) == 3
    assert set(p["quotes"][0]) == {"text", "url", "date"}  # no usernames anywhere


def test_shrinkage_toward_the_course_mean_and_recency():
    # the course as a whole: 6 comments at 2; one professor with 3 comments at 5
    ms = [mention(i, prof=None) for i in range(6)] + [mention(10 + i) for i in range(3)]
    ex = {m.id: rated(2 if m.prof is None else 5) for m in ms}
    out = aggregate(ms, ex, NOW)["courses"]["CS 124"]
    prof = out["profs"]["challen|geoffrey"]["teaching"]
    assert 2 < prof < 5  # pulled toward the course mean, which includes the professor's comments
    assert out["course"]["n"] == 9
    w_new, w_old = reddit.weight(NOW.timestamp(), 0, NOW), reddit.weight(NOW.timestamp() - 2 * YEAR, 0, NOW)
    assert abs(w_old - w_new / 2) < 1e-9  # two-year half-life
    assert reddit.weight(NOW.timestamp(), 100, NOW) > w_new  # upvotes count a little


def test_comments_not_about_teaching_are_left_out():
    ms = [mention(i) for i in range(4)]
    ex = {m.id: rated(5) for m in ms}
    ex[ms[0].id] = {"about_teaching": False}
    assert aggregate(ms, ex, NOW)["courses"]["CS 124"]["profs"]["challen|geoffrey"]["n"] == 3


def test_tags_need_two_comments():
    ms = [mention(i) for i in range(3)]
    ex = {m.id: {**rated(4), "curve": {"value": "yes", "quote": "curved"}} for m in ms[:2]}
    ex[ms[2].id] = rated(4)
    assert aggregate(ms, ex, NOW)["courses"]["CS 124"]["profs"]["challen|geoffrey"]["tags"] == ["curved"]


# ---- collection ----------------------------------------------------------------------------------------------------

def listing(kind, items):
    return {"data": {"children": [{"kind": kind, "data": d} for d in items]}}


def reddit_api(state):
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        state["calls"].append(url)
        if url.startswith(reddit.TOKEN_URL):
            return httpx.Response(200, json={"access_token": "tok"})
        assert request.headers["Authorization"] == "Bearer tok"
        if "/search" in url:
            return httpx.Response(200, json=listing("t3", [{"id": "p1", "num_comments": state["n"]}]))
        if "/comments/p1" in url:
            post = {"id": "p1", "title": "CS 124 with Challen?", "selftext": "", "author": "poster",
                    "created_utc": NOW.timestamp(), "permalink": "/r/UIUC/comments/p1/x/", "score": 4,
                    "num_comments": state["n"]}
            reply = {"id": "c2", "body": "agreed", "author": "bob", "created_utc": 1, "score": 1, "permalink": "/c2/"}
            comments = [{"kind": "t1", "data": {"id": "c1", "body": "Challen is amazing", "author": "alice",
                                                 "created_utc": 1, "score": 9, "permalink": "/c1/",
                                                 "replies": listing("t1", [reply])}},
                        {"kind": "t1", "data": {"id": "c3", "body": "[deleted]", "author": "[deleted]"}},
                        {"kind": "more", "data": {"id": "m"}}]
            return httpx.Response(200, json=[listing("t3", [post]), {"data": {"children": comments}}])
        if "/api/info" in url:
            gone = state.get("gone", set())
            ids = request.url.params["id"].split(",")
            return httpx.Response(200, json=listing("t1", [
                {"name": i, "author": "[deleted]" if i in gone else "x", "body": "[deleted]" if i in gone else "ok"}
                for i in ids]))
        return httpx.Response(404)
    return handler


def test_collect_reads_threads_without_usernames_and_prunes_deletions(tmp_path):
    state: dict[str, Any] = {"calls": [], "n": 2}
    client = reddit.RedditClient("id", "secret", "test", transport=httpx.MockTransport(reddit_api(state)),
                                 sleep=lambda s: None)
    cache = reddit.Cache(tmp_path)
    stats = reddit.collect(client, cache, ['"CS 124" OR "CS124"'])
    assert stats == {"searched": 1, "threads": 1, "dropped": 0}
    t = cache.get("p1")
    assert t is not None
    assert [c["id"] for c in t["comments"]] == ["c1", "c2"]  # replies flattened, deleted and "more" left out
    raw = cache.path("p1").read_text(encoding="utf-8")
    assert "alice" not in raw and "bob" not in raw and "poster" not in raw
    assert len(t["comments"][0]["author"]) == 16
    # next run: same comment count, so the thread isn't read again; a comment deleted upstream is dropped
    state["calls"].clear()
    state["gone"] = {"t1_c2"}
    stats = reddit.collect(client, cache, ['"CS 124" OR "CS124"'])
    assert stats == {"searched": 1, "threads": 0, "dropped": 1}
    assert not any("/comments/p1" in u for u in state["calls"])
    assert any("t=day" in u for u in state["calls"])  # only what's new since the last search
    t = cache.get("p1")
    assert t is not None and [c["id"] for c in t["comments"]] == ["c1"]


def test_no_credentials_means_nothing_runs():
    with pytest.raises(reddit.RedditUnavailable, match="REDDIT_CLIENT_ID"):
        reddit.RedditClient("", "", "test")


def test_search_windows():
    assert reddit.window_since(None, NOW) == "all"
    assert reddit.window_since("2026-11-15T00:00:00+00:00", NOW) == "week"
    assert reddit.window_since("2025-01-01T00:00:00+00:00", NOW) == "all"


def test_context_and_queries_from_the_database(tmp_path):
    from pipeline import db

    conn = db.connect(tmp_path / "t.db")
    conn.executemany("INSERT INTO courses (term, subject, number, title) VALUES ('2027-sp', ?, ?, ?)",
                     [("CS", "124", "Intro"), ("CS", "225", "Data Structures"), ("CS", "591", "Seminar"),
                      ("MATH", "231", "Calculus II")])
    conn.executemany("INSERT INTO sections (term, crn, subject, number, type, component, instructors_raw) "
                     "VALUES ('2027-sp', ?, ?, ?, ?, 'primary', ?)",
                     [("1", "CS", "225", "LEC", "Evans, G"), ("2", "CS", "225", "LEC", "Evans, G"),
                      ("3", "CS", "124", "LEC", "Challen, G"), ("4", "CS", "591", "LCD", "Amato, N"),
                      ("5", "CS", "199", "IND", "Nobody, Q")])
    conn.execute("INSERT INTO instructor_aliases (source, raw_name, subject, number, instructor_key, method) "
                 "VALUES ('course-explorer', 'Evans, G', 'CS', '', 'evans|graham', 'subject')")
    conn.execute("INSERT INTO gpa_instructor_course (subject, number, instructor_key, instructor_name) "
                 "VALUES ('CS', '124', 'challen|geoffrey', 'Challen, Geoffrey')")
    c = reddit.load_context(conn)
    assert c.aliases["calc 2"] == ("MATH", "231") and "calc 1" not in c.aliases
    assert c.teachers[("CS", "225")] == {"evans|graham": ("evans", "Evans")}
    assert c.teachers[("CS", "124")] == {"challen|geoffrey": ("challen", "Challen")}
    # undergraduate classes only, most lecture sections first, then surnames
    assert reddit.search_queries(conn, c) == ['"CS 225" OR "CS225"', '"CS 124" OR "CS124"', '"Evans" CS',
                                              '"Challen" CS']
