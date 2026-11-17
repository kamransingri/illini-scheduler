"""Rate My Professors client (unofficial GraphQL endpoint used by ratemyprofessors.com).

Rules (docs/DECISIONS.md D3.x, D18): look up the UIUC school id through RMP's own school search (never hard-coded),
max 2 concurrent requests with a 0.5 s delay, a User-Agent naming the project, responses cached in data/raw/rmp/
(refreshed after 7 days when the run's budget allows, used for up to 90), and only short review snippets
(<= 200 chars, the 20 newest per instructor) are kept. When RMP can't be reached and nothing is cached the client
reports "unavailable", so the pipeline still finishes and the UI shows "RMP unavailable".
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from .config import USER_AGENT
from .names import NameParts, first_compatible, last_compatible, parse_name, strip_accents

GRAPHQL = "https://www.ratemyprofessors.com/graphql"
# The site's own public client header (base64 "test:test"); not a secret.
AUTH = "Basic dGVzdDp0ZXN0"
SCHOOL_NAME = "University of Illinois at Urbana-Champaign"
CACHE_DAYS = 7     # a cached answer is refreshed after this many days, when the run's time budget allows...
STALE_DAYS = 90    # ...and used until then, so coverage builds up across nightly runs instead of expiring
SNIPPET_LEN = 200
MAX_REVIEWS = 20   # every rating one search returns (`ratings(first: 20)`), newest first, each cut to SNIPPET_LEN
SEARCH_PAGE = 20   # teachers per search (`teachers(first: 20)`); a full page may have cut off the right person

SCHOOL_QUERY = """query SchoolSearch($query: SchoolSearchQuery!) {
  newSearch { schools(query: $query) { edges { node { id legacyId name city state } } } }
}"""

TEACHER_QUERY = """query TeacherSearch($query: TeacherSearchQuery!) {
  newSearch { teachers(query: $query, first: 20) { edges { node {
    id legacyId firstName lastName department avgRating avgDifficulty wouldTakeAgainPercent numRatings
    teacherRatingTags { tagName tagCount }
    ratings(first: 20) { edges { node { comment class date } } }
  } } } }
}"""

# RMP department names that are plausible for a UIUC subject code. Unknown subjects accept any department.
SUBJECT_DEPTS: dict[str, tuple[str, ...]] = {
    "CS": ("computer science", "computer", "engineering", "information"),
    "MATH": ("mathematics", "math", "statistics"),
    "STAT": ("statistics", "mathematics", "math", "computer science", "data"),
    "RHET": ("rhetoric", "english", "writing", "composition", "literature"),
    "ECE": ("electrical", "computer", "engineering"),
    "PHYS": ("physics",),
    "CHEM": ("chemistry",),
    "ECON": ("economics",),
    "PSYC": ("psychology",),
    "ENGL": ("english", "literature", "writing"),
}

# Short and long forms of the same given name (RMP often has the name a professor goes by: "Bob" for Robert).
NICKNAMES: tuple[frozenset[str], ...] = tuple(frozenset(g.split()) for g in (
    "robert bob rob bobby robbie", "william bill will billy", "richard rick rich dick", "michael mike mick",
    "james jim jimmy jamie", "john jack johnny", "joseph joe joey", "thomas tom tommy", "charles chuck charlie",
    "edward ed eddie ted", "theodore ted teddy theo", "anthony tony", "andrew andy drew", "daniel dan danny",
    "david dave", "steven stephen steve", "matthew matt", "christopher chris", "nicholas nick nicolas",
    "benjamin ben", "samuel sam", "alexander alex", "jonathan jon", "timothy tim", "gregory greg", "lawrence larry",
    "kenneth ken kenny", "ronald ron", "donald don", "douglas doug", "gerald jerry", "patrick pat", "peter pete",
    "philip phillip phil", "raymond ray", "frederick fred", "zachary zach zack", "nathaniel nathan nate",
    "joshua josh", "jacob jake", "gabriel gabe", "bradley brad", "randall randy", "vincent vince", "walter walt",
    "francis frank", "henry hank", "elizabeth elisabeth liz beth betsy", "katherine catherine kathryn katie kate kathy",
    "margaret maggie meg peggy", "jennifer jen jenny", "jessica jess", "rebecca becky becca", "susan sue susie",
    "patricia patty trish", "victoria vicky tori", "sandra sandy", "deborah debra deb debbie", "kimberly kim",
    "christine christina tina", "alexandra alex", "samantha sam", "abigail abby", "amanda mandy", "pamela pam",
    "cynthia cindy", "judith judy", "barbara barb", "jacqueline jackie", "melissa missy", "stephanie steph",
))


class RmpUnavailable(RuntimeError):
    pass


@dataclass
class RmpTeacher:
    rmp_id: str
    first_name: str
    last_name: str
    department: str
    avg_rating: float | None
    avg_difficulty: float | None
    would_take_again_pct: float | None
    num_ratings: int
    top_tags: list[str] = field(default_factory=list)
    reviews: list[dict[str, str]] = field(default_factory=list)
    fetched_at: str = ""  # when RMP sent this answer (the cache file's time when it came from the cache)

    @property
    def url(self) -> str:
        return f"https://www.ratemyprofessors.com/professor/{self.rmp_id}"


def dept_plausible(subject: str, department: str) -> bool:
    allowed = SUBJECT_DEPTS.get(subject)
    if not allowed:
        return True
    d = department.lower()
    return any(a in d for a in allowed)


def course_code(rmp_class: str) -> str:
    """RMP's free-text class ("MATH221", "math 221", "CS-124") as "MATH221"; "" when it isn't a course code."""
    c = re.sub(r"[^A-Z0-9]", "", rmp_class.upper())
    return c if re.fullmatch(r"[A-Z]{2,5}\d{3}", c) else ""


def review_courses(reviews: list[dict[str, str]]) -> set[str]:
    return {c for r in reviews if (c := course_code(r.get("course", "")))}


def fits_subject(subject: str, department: str, reviews: list[dict[str, str]]) -> bool:
    """Whether an RMP profile belongs on a page for this subject: its department is plausible for it (any is, for a
    subject without a department list) or a review was written for a course in it. Course Explorer gives one name
    ("Anderson, J") to different people; this keeps an Education professor's reviews off a MATH page."""
    return dept_plausible(subject, department) or any(c[:-3] == subject for c in review_courses(reviews))


def _tokens(s: str) -> list[str]:
    return [w for w in (re.sub(r"[^a-z]", "", x) for x in re.split(r"[\s\-]+", strip_accents(s).lower())) if w]


def _one_edit(a: str, b: str) -> bool:
    """One letter added, dropped or changed, or two neighbours swapped: Elisabeth/Elizabeth, Jeffery/Jeffrey."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        diff = [i for i in range(len(a)) if a[i] != b[i]]
        return len(diff) == 1 or (len(diff) == 2 and diff[1] == diff[0] + 1
                                   and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]])
    short, long_ = sorted((a, b), key=len)
    return any(long_[:i] + long_[i + 1:] == short for i in range(len(long_)))


def first_name_fit(name: NameParts, t: RmpTeacher, tp: NameParts) -> str | None:
    """"exact" when the given names agree the usual way (same name, an initial, or one a prefix of the other); "loose"
    for a nickname, a middle name RMP lists first ("Robert Lee Deville" for Lee DeVille) or a one-letter spelling
    difference; None for a different name. choose_match accepts a loose fit only with evidence."""
    if first_compatible(name, tp):
        return "exact"
    ours, theirs = name.first_name, tp.first_name
    if not ours or not theirs:
        return None  # an initial that differs is a different person
    if ours in _tokens(t.first_name):
        return "loose"
    if any(ours in g and theirs in g for g in NICKNAMES):
        return "loose"
    if ours[0] == theirs[0] and min(len(ours), len(theirs)) >= 5 and _one_edit(ours, theirs):
        return "loose"
    return None


def parse_teacher(node: dict[str, Any]) -> RmpTeacher:
    tags = sorted(node.get("teacherRatingTags") or [], key=lambda t: -int(t.get("tagCount") or 0))
    reviews = []
    for e in (node.get("ratings") or {}).get("edges", []):
        r = e.get("node") or {}
        comment = " ".join((r.get("comment") or "").split())
        if not comment:
            continue
        if len(comment) > SNIPPET_LEN:
            comment = comment[: SNIPPET_LEN - 1].rsplit(" ", 1)[0] + "…"
        reviews.append({"text": comment, "course": (r.get("class") or "").upper(), "date": (r.get("date") or "")[:10]})
    reviews.sort(key=lambda r: r["date"], reverse=True)
    wta = node.get("wouldTakeAgainPercent")
    n = int(node.get("numRatings") or 0)
    if n == 0:  # RMP reports 0.0 for a profile nobody has rated; that is "no data", not a bad score
        node = {**node, "avgRating": None, "avgDifficulty": None}
        wta = None
    return RmpTeacher(
        rmp_id=str(node.get("legacyId") or node.get("id")), first_name=node.get("firstName", ""),
        last_name=node.get("lastName", ""), department=node.get("department") or "",
        avg_rating=node.get("avgRating"), avg_difficulty=node.get("avgDifficulty"),
        would_take_again_pct=None if wta is None or wta < 0 else float(wta),
        num_ratings=int(node.get("numRatings") or 0), top_tags=[t["tagName"] for t in tags[:5]],
        reviews=reviews[:MAX_REVIEWS],
    )


def same_surname(key: str, rmp_last: str) -> bool:
    """Our surname key against RMP's last name: equal, or RMP's is a compound surname that starts with ours
    (Course Explorer "Gonzalez, D" is RMP's "Daniel Gonzalez Cedre"). Words are split on spaces and hyphens."""
    words = [w for w in (re.sub(r"[^a-z]", "", x) for x in re.split(r"[\s\-]+", strip_accents(rmp_last).lower())) if w]
    return bool(words) and (key == "".join(words) or (len(words) > 1 and key == words[0]))


def choose_match(name: NameParts, subjects: str | set[str] | frozenset[str], teachers: list[RmpTeacher],
                 taught: set[str] | frozenset[str] = frozenset()) -> RmpTeacher | None:
    """The RMP profile for this instructor, or None. `subjects` are the subjects they teach, `taught` their courses
    ("MATH221"). A profile needs the same surname, a fitting given name (first_name_fit) and some sign it's the
    same person: a department plausible for one of the subjects, or a review for a course in one of them. A loose
    name fit needs a stronger sign: a review for one of their subjects, or a department from SUBJECT_DEPTS.
    When the name fits several people, a review for one of the instructor's own courses decides; failing that,
    an initial alone ("J. Smith": John or Jane) is not guessed, and a full name takes the best-fitting, most-rated
    profile."""
    subs = {subjects} if isinstance(subjects, str) else set(subjects)
    ok: list[tuple[RmpTeacher, bool, bool, bool]] = []  # teacher, exact name fit, reviewed course, reviewed subject
    for t in teachers:
        tp = parse_name(f"{t.last_name}, {t.first_name}")
        if tp is None or not (same_surname(name.last, t.last_name) or last_compatible(name, tp)):
            continue  # last_compatible keeps the GPA dataset's 15-character truncated surnames matching
        fit = first_name_fit(name, t, tp)
        if fit is None:
            continue
        courses = review_courses(t.reviews)
        on_course = bool(courses & set(taught))
        on_subject = any(c[:-3] in subs for c in courses)
        dept_ok = any(dept_plausible(s, t.department) for s in subs)
        dept_known = any(s in SUBJECT_DEPTS and dept_plausible(s, t.department) for s in subs)
        if not (dept_ok or on_subject):
            continue
        if fit == "loose" and not (on_subject or dept_known):
            continue
        ok.append((t, fit == "exact", on_course, on_subject))
    if not ok:
        return None

    def person(t: RmpTeacher) -> tuple[str, str]:
        return (t.first_name.lower(), t.last_name.lower())

    if len({person(c[0]) for c in ok}) > 1:
        reviewed = [c for c in ok if c[2]]
        if len({person(c[0]) for c in reviewed}) == 1:
            return max(reviewed, key=lambda c: c[0].num_ratings)[0]
        if not name.first_name:
            return None  # e.g. "J. Smith" matches John and Jane Smith -> don't guess
    return max(ok, key=lambda c: (c[1], c[2], c[3], c[0].num_ratings))[0]


class RmpClient:
    def __init__(self, cache_dir: Path, enabled: bool = True, delay: float = 0.5, transport: Any = None):
        self.cache_dir = cache_dir
        self.enabled = enabled
        self.delay = delay
        self._sem = threading.Semaphore(2)
        self._lock = threading.Lock()
        self._last = 0.0
        self.school_id: str | None = None
        self.error: str | None = None if enabled else "disabled"
        self.last_fetched = ""  # when the answer _post just returned was fetched
        self._memo: dict[Path, tuple[dict[str, Any], str]] = {}  # answers already read in this run
        self._client = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Authorization": AUTH, "Content-Type": "application/json"},
            timeout=20, transport=transport,
        )

    def _cache_path(self, query: str, variables: dict[str, Any]) -> Path:
        h = hashlib.sha1(json.dumps([query, variables], sort_keys=True).encode()).hexdigest()[:16]
        return self.cache_dir / f"{h}.json"

    def _post(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        cache = self._cache_path(query, variables)
        if cache in self._memo:
            data, self.last_fetched = self._memo[cache]
            return data
        stale: dict[str, Any] | None = None
        stale_when = ""
        if cache.exists():
            when = datetime.fromtimestamp(cache.stat().st_mtime, UTC)
            age = datetime.now(UTC) - when
            cached = dict(json.loads(cache.read_text()))
            if not cached.get("errors") and age < timedelta(days=STALE_DAYS):
                if age < timedelta(days=CACHE_DAYS):
                    self.last_fetched = when.isoformat(timespec="seconds")
                    self._memo[cache] = (cached, self.last_fetched)
                    return cached
                stale, stale_when = cached, when.isoformat(timespec="seconds")
        if not self.enabled or self.error:
            if stale is not None:  # out of budget, or RMP failed earlier in this run: the older answer will do
                return self._use_stale(cache, stale, stale_when)
            raise RmpUnavailable(self.error or "disabled")
        with self._sem:
            with self._lock:
                wait = self._last + self.delay - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                self._last = time.monotonic()
            try:
                r = self._client.post(GRAPHQL, json={"query": query, "variables": variables})
                r.raise_for_status()
                data = r.json()
            except (httpx.HTTPError, ValueError) as e:
                self.error = f"{type(e).__name__}: {e}"[:200]
                if stale is not None:
                    return self._use_stale(cache, stale, stale_when)
                raise RmpUnavailable(self.error) from e
        if "errors" in data and not data.get("data"):
            self.error = f"GraphQL error: {str(data['errors'])[:150]}"
            if stale is not None:
                return self._use_stale(cache, stale, stale_when)
            raise RmpUnavailable(self.error)
        self.last_fetched = datetime.now(UTC).isoformat(timespec="seconds")
        if not data.get("errors"):  # a partial failure is retried next run, not cached for a week
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(data))
            self._memo[cache] = (dict(data), self.last_fetched)
        return dict(data)

    def _use_stale(self, cache: Path, data: dict[str, Any], when: str) -> dict[str, Any]:
        self.last_fetched = when
        self._memo[cache] = (data, when)
        return data

    def find_school(self, name: str = SCHOOL_NAME) -> str:
        data = self._post(SCHOOL_QUERY, {"query": {"text": name}})
        nodes = [e["node"] for e in data["data"]["newSearch"]["schools"]["edges"]]
        urbana = [n for n in nodes if n.get("state") == "IL"
                  and "urbana" in (n.get("name", "") + " " + n.get("city", "")).lower()]
        # RMP also lists "UIC College of Medicine" in Urbana-Champaign and the law school; the university itself is the
        # one with Urbana in its name and no college or school after it, wherever RMP puts it in the list.
        urbana.sort(key=lambda n: ("urbana" not in n.get("name", "").lower(),
                                   bool(re.search(r"\b(college|school)\b", n.get("name", ""), re.I))))
        if urbana:
            self.school_id = str(urbana[0]["id"])
            return self.school_id
        self.error = "UIUC not found in RMP school search"
        raise RmpUnavailable(self.error)

    def search_teachers(self, text: str) -> list[RmpTeacher]:
        if self.school_id is None:
            self.find_school()
        data = self._post(TEACHER_QUERY, {"query": {"text": text, "schoolID": self.school_id}})
        # RMP sometimes answers one query with an error and `teachers: null` (its search backend refused it):
        # that is "no result this run" for this name, not a reason to stop the whole pipeline.
        teachers = ((data.get("data") or {}).get("newSearch") or {}).get("teachers") or {}
        found = [parse_teacher(e["node"]) for e in teachers.get("edges") or []]
        for t in found:
            t.fetched_at = self.last_fetched
        return found

    def lookup(self, raw_name: str, subjects: str | set[str] | frozenset[str],
               taught: set[str] | frozenset[str] = frozenset()) -> RmpTeacher | None:
        p = parse_name(raw_name)
        if p is None:
            return None
        last = raw_name.split(",")[0].strip() if "," in raw_name else raw_name.split()[-1]
        found = self.search_teachers(last)
        t = choose_match(p, subjects, found, taught)
        if t is None and len(found) >= SEARCH_PAGE and p.first_name:
            # A common surname ("Lee", "Wang") fills RMP's 20 results before this person: ask for the full name.
            t = choose_match(p, subjects, self.search_teachers(f"{p.first_name} {last}"), taught)
        return t
