import json

import httpx

from pipeline import availability, live_seats
from pipeline.config import FIXTURES
from tools import api_docs

PAGE = (FIXTURES / "course-explorer-web" / "2026-fa_CS124.html").read_bytes()
NOW = "2026-11-17T12:00:00+00:00"


class FakeClient:
    def __init__(self, codes):
        self.codes = codes
        self.calls = []

    def get(self, url, headers=None):
        self.calls.append(url)
        for suffix, code in self.codes.items():
            if url.endswith(suffix):
                return httpx.Response(code, content=PAGE if code == 200 else b"", request=httpx.Request("GET", url))
        return httpx.Response(404, request=httpx.Request("GET", url))


def daily_file() -> dict:
    """A daily-crawl term file: CS 124 from the real page, with one section remembered as Open (it's Closed now)."""
    statuses = availability.parse_availability(PAGE)
    page = availability.parse_course_page(PAGE)
    sections = {crn: [st, "2026-11-10T04:30:00+00:00", ""] for crn, st in statuses.items()}
    sections["76898"] = ["Open", "2026-11-10T04:30:00+00:00", ""]
    rows = {"CS 124": {"title": "Intro to Computer Science I", "sections": page["sections"]},
            "ART 100": {"title": "Calm course", "sections": [{"crn": "11111", "code": "A"}]},
            "BIG 101": {"title": "Busy course",
                        "sections": [{"crn": "22222", "code": "A"}, {"crn": "22223", "code": "B"}]}}
    sections["11111"] = ["Open", "2026-11-10T04:30:00+00:00", ""]
    sections["22222"] = ["Closed", "2026-11-10T04:30:00+00:00", ""]
    sections["22223"] = ["Closed", "2026-11-10T04:30:00+00:00", ""]
    events = [["2026-11-16T20:00:00+00:00", "22222", "BIG 101", "A", "Open", "Closed"]] * 3
    return {"rows": rows, "sections": sections, "events": events}


def test_hot_courses_skip_quiet_ones_and_rotate():
    daily = daily_file()
    live = live_seats.term_state({"terms": {}}, "2026-fa")
    hot = live_seats.hot_courses(daily, live, NOW, 10)
    assert "ART 100" not in hot  # all open, nothing moving
    assert hot[0] in {"BIG 101", "CS 124"}
    live["courses"]["BIG 101"] = NOW  # just re-read: goes to the back of the rotation...
    assert live_seats.hot_courses(daily, live, NOW, 10, always=0)[-1] == "BIG 101"
    # ...unless it's among the busiest, which are re-read every run
    assert live_seats.hot_courses(daily, live, NOW, 10, always=1)[0] == hot[0]
    assert len(live_seats.hot_courses(daily, live, NOW, 1)) == 1


def test_load_watch_reads_courses_crns_and_terms():
    daily = daily_file()
    text = """
    # comment line
    cs124            # a course, any term
    2026-fa 22223    # a CRN: BIG 101
    2027-sp ART 100  # another term: skipped
    MATH 999         # not offered
    CS 124           # repeated: kept once
    """
    courses, unknown = live_seats.load_watch(text, "2026-fa", daily)
    assert courses == ["CS 124", "BIG 101"]
    assert unknown == ["MATH 999"]
    assert live_seats.load_watch(text, "2027-sp", daily)[0] == ["CS 124", "ART 100"]
    assert live_seats.load_watch("", "2026-fa", daily) == ([], [])
    # the shipped file has only comments
    assert live_seats.load_watch(live_seats.WATCH_FILE.read_text(encoding="utf-8"), "2026-fa", daily) == ([], [])


def test_watched_courses_are_always_picked():
    daily = daily_file()
    live = live_seats.term_state({"terms": {}}, "2026-fa")
    # ART 100 is quiet (all open, nothing moving), so only the watch list gets it re-read
    hot = live_seats.hot_courses(daily, live, NOW, 10, watched=["ART 100"])
    assert hot[0] == "ART 100" and hot.count("ART 100") == 1
    live["courses"]["ART 100"] = NOW  # just re-read: still first, unlike the rotation
    assert live_seats.hot_courses(daily, live, NOW, 10, always=0, watched=["ART 100"])[0] == "ART 100"
    # a watched course that's busy anyway isn't counted twice
    hot = live_seats.hot_courses(daily, live, NOW, 10, watched=["BIG 101"])
    assert hot.count("BIG 101") == 1 and hot[0] == "BIG 101"
    # a course the term doesn't have is ignored
    assert "NOPE 101" not in live_seats.hot_courses(daily, live, NOW, 10, watched=["NOPE 101"])


def busy_term(n_busy: int, n_quiet: int) -> dict:
    """A daily file with `n_busy` courses that each have a closed section and `n_quiet` all-open ones."""
    rows, sections = {}, {}
    for i in range(n_busy + n_quiet):
        course, crn = (f"BUSY {100 + i}", f"{10000 + i}") if i < n_busy else (f"QUIET {100 + i}", f"{50000 + i}")
        rows[course] = {"title": "", "sections": [{"crn": crn, "code": "A"}]}
        sections[crn] = ["Closed" if i < n_busy else "Open", "2026-11-10T04:30:00+00:00", ""]
    return {"rows": rows, "sections": sections, "events": []}


def test_watch_list_stays_in_budget_and_the_rotation_still_covers_the_rest():
    """With a full watch list of quiet courses, every run re-reads all of them, and the top 400 busy courses are each
    re-read within 3 runs of ~240 courses (6 minutes at 1.5 s), about 30 minutes."""
    daily = busy_term(600, 100)
    live = live_seats.term_state({"terms": {}}, "2026-fa")
    watched = [f"QUIET {100 + 600 + i}" for i in range(live_seats.MAX_WATCHED + 10)]  # 10 over the limit
    per_run = 6 * 60 / 1.5
    top = set(live_seats.hot_courses(daily, live, NOW, 400)[:400])
    read: set[str] = set()
    for run in range(3):
        at = f"2026-11-17T12:{10 * run:02d}:00+00:00"
        picked = live_seats.hot_courses(daily, live, at, 400, watched=watched)[: int(per_run)]
        assert picked[: live_seats.MAX_WATCHED] == watched[: live_seats.MAX_WATCHED]  # every run, first
        assert not set(watched[live_seats.MAX_WATCHED:]) & set(picked)  # over the limit: left out
        for c in picked:
            live["courses"][c] = at
        read |= set(picked)
    assert top <= read


def test_check_records_a_change_once():
    daily = daily_file()
    state = {"terms": {}}
    live = live_seats.term_state(state, "2026-fa")
    titles = {c: p["title"] for c, p in daily["rows"].items()}
    msg = live_seats.check("2026-fa", ["CS 124"], daily, live, titles, 1e12, 0, FakeClient({"/CS/124": 200}),
                           lambda *_: None)
    assert "1 of 1" in msg and "1 changes" in msg
    ev = live["events"][0]
    assert ev["crn"] == "76898" and ev["old"] == "Open" and ev["new"] == "Closed" and ev["s"] == "CS"
    assert ev["t"] == "Intro to Computer Science I" and ev["code"]
    # the next run compares with what this job saw, so the same change isn't logged twice
    live_seats.check("2026-fa", ["CS 124"], daily, live, titles, 1e12, 0, FakeClient({"/CS/124": 200}),
                     lambda *_: None)
    assert len(live["events"]) == 1
    # the page learns when each course was re-read (a watched section with no change is still fresh) and the watch list
    live["watched"] = ["CS 124"]
    view = live_seats.public_view(state, NOW)
    assert view["read"]["2026-fa"]["CS 124"] == live["courses"]["CS 124"]
    assert view["watched"] == {"2026-fa": ["CS 124"]}
    assert api_docs.check("live.json", view) == set()  # docs/API.md covers the file


def test_stops_after_pushback_and_publishes_small_file(tmp_path):
    daily = daily_file()
    state = {"terms": {}}
    live = live_seats.term_state(state, "2026-fa")
    courses = [f"CS {100 + i}" for i in range(8)]
    client = FakeClient({f"/CS/{100 + i}": 202 for i in range(8)})
    msg = live_seats.check("2026-fa", courses, daily, live, {}, 1e12, 0, client, lambda *_: None)
    assert len(client.calls) == 5 and "stopped early" in msg
    live["events"].append({"term": "2026-fa", "at": "2026-11-10T00:00:00+00:00", "crn": "1", "s": "X", "n": "1",
                           "code": "A", "old": "Closed", "new": "Open", "t": ""})
    live["events"].append({"term": "2026-fa", "at": NOW, "crn": "76898", "s": "CS", "n": "124",
                           "code": "AL1", "old": "Closed", "new": "Open", "t": ""})
    live["sections"]["76898"] = ["Open", NOW]
    live_seats.prune(state, NOW)
    view = live_seats.public_view(state, NOW)
    assert [e["crn"] for e in view["events"]] == ["76898"]  # older than the window: dropped
    assert view["seen"]["2026-fa"]["76898"] == ["Open", NOW]
    json.dumps(view)
