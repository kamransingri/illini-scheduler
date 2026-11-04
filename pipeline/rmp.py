"""Rate My Professors client (unofficial GraphQL endpoint used by ratemyprofessors.com).

Rules (DECISIONS.md D3.x): look up the UIUC school id through RMP's own school search (never hard-coded),
max 2 concurrent requests with a 0.5 s delay, a User-Agent naming the project, responses cached 7 days in
data/raw/rmp/, and only short review snippets (<= 200 chars, 3 per instructor) are kept. Any failure makes
the client report "unavailable" so the pipeline still finishes and the UI shows "RMP unavailable".
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from .config import USER_AGENT
from .names import NameParts, compatible, parse_name

GRAPHQL = "https://www.ratemyprofessors.com/graphql"
# The site's own public client header (base64 "test:test"); not a secret.
AUTH = "Basic dGVzdDp0ZXN0"
SCHOOL_NAME = "University of Illinois at Urbana-Champaign"
CACHE_DAYS = 7
SNIPPET_LEN = 200
MAX_SNIPPETS = 3

SCHOOL_QUERY = """query SchoolSearch($query: SchoolSearchQuery!) {
  newSearch { schools(query: $query) { edges { node { id legacyId name city state } } } }
}"""

TEACHER_QUERY = """query TeacherSearch($query: TeacherSearchQuery!) {
  newSearch { teachers(query: $query, first: 8) { edges { node {
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

    @property
    def url(self) -> str:
        return f"https://www.ratemyprofessors.com/professor/{self.rmp_id}"


def dept_plausible(subject: str, department: str) -> bool:
    allowed = SUBJECT_DEPTS.get(subject)
    if not allowed:
        return True
    d = department.lower()
    return any(a in d for a in allowed)


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
    return RmpTeacher(
        rmp_id=str(node.get("legacyId") or node.get("id")), first_name=node.get("firstName", ""),
        last_name=node.get("lastName", ""), department=node.get("department") or "",
        avg_rating=node.get("avgRating"), avg_difficulty=node.get("avgDifficulty"),
        would_take_again_pct=None if wta is None or wta < 0 else float(wta),
        num_ratings=int(node.get("numRatings") or 0), top_tags=[t["tagName"] for t in tags[:5]],
        reviews=reviews[:MAX_SNIPPETS],
    )


def choose_match(name: NameParts, subject: str, teachers: list[RmpTeacher]) -> RmpTeacher | None:
    """Accept only exact last-name matches with a compatible first name/initial and a plausible department.
    If several qualify, take the one with most ratings only when it is clearly the same person (same name)."""
    ok = []
    for t in teachers:
        tp = parse_name(f"{t.last_name}, {t.first_name}")
        if tp is None or tp.last != name.last:
            continue
        if not compatible(name, tp):
            continue
        if not dept_plausible(subject, t.department):
            continue
        ok.append(t)
    if not ok:
        return None
    if len({(t.first_name.lower(), t.last_name.lower()) for t in ok}) > 1 and not name.first_name:
        return None  # e.g. "J. Smith" matches John and Jane Smith -> don't guess
    return max(ok, key=lambda t: t.num_ratings)


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
        self._client = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Authorization": AUTH, "Content-Type": "application/json"},
            timeout=20, transport=transport,
        )

    def _cache_path(self, query: str, variables: dict[str, Any]) -> Path:
        h = hashlib.sha1(json.dumps([query, variables], sort_keys=True).encode()).hexdigest()[:16]
        return self.cache_dir / f"{h}.json"

    def _post(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        cache = self._cache_path(query, variables)
        if cache.exists():
            age = datetime.now(UTC) - datetime.fromtimestamp(cache.stat().st_mtime, UTC)
            if age < timedelta(days=CACHE_DAYS):
                return dict(json.loads(cache.read_text()))
        if not self.enabled or self.error:
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
                raise RmpUnavailable(self.error) from e
        if "errors" in data and not data.get("data"):
            self.error = f"GraphQL error: {str(data['errors'])[:150]}"
            raise RmpUnavailable(self.error)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(data))
        return dict(data)

    def find_school(self, name: str = SCHOOL_NAME) -> str:
        data = self._post(SCHOOL_QUERY, {"query": {"text": name}})
        edges = data["data"]["newSearch"]["schools"]["edges"]
        for e in edges:
            n = e["node"]
            if "urbana" in (n.get("name", "") + " " + n.get("city", "")).lower() and n.get("state") == "IL":
                self.school_id = n["id"]
                return str(n["id"])
        self.error = "UIUC not found in RMP school search"
        raise RmpUnavailable(self.error)

    def search_teachers(self, text: str) -> list[RmpTeacher]:
        if self.school_id is None:
            self.find_school()
        data = self._post(TEACHER_QUERY, {"query": {"text": text, "schoolID": self.school_id}})
        return [parse_teacher(e["node"]) for e in data["data"]["newSearch"]["teachers"]["edges"]]

    def lookup(self, raw_name: str, subject: str) -> RmpTeacher | None:
        p = parse_name(raw_name)
        if p is None:
            return None
        last = raw_name.split(",")[0].strip() if "," in raw_name else raw_name.split()[-1]
        return choose_match(p, subject, self.search_teachers(last))
