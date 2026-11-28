"""Course materials 3 (#61): what to buy for a course, read from text the University publishes.

Two trusted sources, never the bookstore (its robots.txt disallows /textbook*, #59):
- Course Explorer section text and the course's section information, already in the database.
- Official course pages under *.illinois.edu listed in data/course-pages.csv, read where robots.txt allows it, cached in
  data/raw/course-pages/ and at most one request a second.

Deterministic rules only, like pipeline/exam_format.py. Every item carries the sentence it came from (`quote`), and an
item the text doesn't support is never added: a course with no matches has no list, not an empty one. `need` is set only
when the text or the page heading says it (required, recommended, optional, choose-one, or none for "no required
textbook").
"""

from __future__ import annotations

import csv
import json
import re
import sqlite3
import time
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from .config import DATA, RAW, USER_AGENT

PAGES_CSV = DATA / "course-pages.csv"
CACHE = RAW / "course-pages"
CACHE_DAYS = 7
QUOTE_LEN = 160
CE_TEXT = "Course Explorer section text"
CE_INFO = "Course Explorer section information"
PAGE = "Course page"

# The campus rules for iClicker, word for word from the campus guide (exported in meta.json as `iclicker_notes`).
ICLICKER_GUIDE = "https://answers.illinois.edu/120820"
ICLICKER_NOTES = [
    "Ask your instructor whether they require you to use the iClicker Student app or a remote. Many permit either, "
    "but some require a specific option.",
    "The app is required in attendance-only courses but also works with polls and quizzes. You must purchase a "
    "subscription to use it.",
    "If you already have a Pro subscription, you do not also need a Pulse one.",
    "If you only use the iClicker remote, then you do not need a subscription.",
    "If you buy a new remote, you will also have the option to register it for a free subscription to the app, but "
    "don’t use the remote and the app in the same course.",
]

NEEDS = ("required", "recommended", "optional", "choose-one", "none")
KINDS = ("textbook", "access-code", "day1access", "fee", "iclicker", "iclicker-remote", "iclicker-subscription",
         "lab-kit", "laptop", "calculator", "platform")


@dataclass(frozen=True)
class Item:
    kind: str
    title: str
    quote: str
    source: str
    need: str | None = None
    price: str | None = None
    url: str | None = None

    def key(self) -> tuple[str, str, str | None, str | None]:
        # two books under one heading are two items; any other repeat is the same item said twice
        return (self.kind, self.quote if self.kind == "textbook" and self.need != "none" else self.title, self.need,
                self.price)

    def record(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


# --- text -------------------------------------------------------------------------------------------------------------

MONEY = r"\$\d[\d,]*(?:\.\d\d)?"
_REQ = re.compile(r"\b(?:required|requires?|must|need to|needs to|will need|you need|mandatory|pay for|"
                  r"purchas(?:e|ing)|buy)\b")
_REC = re.compile(r"\b(?:recommended|encouraged|suggested)\b")
_OPT = re.compile(r"\boptional\b")

# Paid homework and courseware platforms: (title, pattern). A mention is an item; `need` comes from the sentence.
PAID = [
    ("ALEKS", re.compile(r"\baleks\b")),
    ("WebAssign", re.compile(r"\bwebassign\b")),
    ("Pearson MyLab", re.compile(r"\bmylab\b|\bmy ?(?:math|stat|econ|finance|accounting)lab\b")),
    ("Pearson Mastering", re.compile(r"\bmastering ?(?:physics|chemistry|biology|a&p|engineering|astronomy)\b|"
                                     r"\bpearson mastering\b")),
    ("McGraw Hill Connect", re.compile(r"\bmcgraw[- ]?hill connect\b|\bconnect (?:access )?code\b")),
    ("zyBooks", re.compile(r"\bzybooks?\b")),
    ("Top Hat", re.compile(r"\btop ?hat (?:classroom|account|subscription|app|code)\b|\btophat\b")),
    ("Cengage", re.compile(r"\bcengage\b|\bmindtap\b")),
]
# "an adequate ALEKS score", "Placement Exam ... math.illinois.edu/ALEKS": the placement test, not homework
_PLACEMENT = re.compile(r"placement|\bscores?\b|prerequisite|math\.illinois\.edu/aleks")
FREE = [
    ("PrairieLearn", re.compile(r"\bPrairie ?Learn\b")),
    ("PrairieTest", re.compile(r"\bPrairie ?Test\b")),
    ("Canvas", re.compile(r"\bCanvas\b(?! (?:board|panel|painting|bag|tote|print))")),
]

_DAY1 = re.compile(rf"day ?1 ?access course materials? cost ((?:{MONEY})(?:,? (?:and|or) {MONEY})*)")
_FEE = [
    ("Lab fee", re.compile(rf"\blab(?:oratory)? fee of ({MONEY})|({MONEY}) lab(?:oratory)? fee\b")),
    ("Class materials fee", re.compile(rf"({MONEY}) (?:class|course) materials? fee\b|"
                                       rf"\b(?:class|course) materials? fee of ({MONEY})")),
]
_NO_TEXTBOOK = re.compile(r"\bno (?:required )?text ?books?\b|\btext ?books? (?:is |are )?(?:not "
                          r"(?:required|needed|necessary)|optional)\b|\bno text ?book is required\b|"
                          r"\bthere is no required text ?book\b|\bdoes not require a text ?book\b")
_TEXTBOOK_REQ = re.compile(r"\btext ?book (?:is |are )?(?:required|mandatory)\b|\brequired text ?books?\b")
_KEYCODE = re.compile(r"\b(?:e-?text ?book|online resources?|online homework)\b.{0,80}\b(?:key ?code|access code|"
                      r"fee)\b|\b(?:key ?code|access code)\b.{0,80}\be-?text ?book\b|"
                      r"\badditional fee to access\b")
_SMART = re.compile(r"\bsmart ?physics\b|\bsmart\.physics\b")
_BOOKISH = re.compile(r"\btext ?book\b|\b(?:any|latest|\d+(?:st|nd|rd|th)) edition\b|\blecture notes\b|\bbook\b|"
                      r"\bprimary reference\b")

_KIT = [
    ("Molecular model kit", re.compile(r"\bmolecular model kit\b|\bmodel kit\b")),
    ("IOLab Accessory Pack", re.compile(r"\biolab accessory pack\b")),
    ("IOLab device", re.compile(r"\biolab(?: device)?\b(?! accessory)")),
    ("Lab coat", re.compile(r"\blab coat\b")),
    ("Safety goggles", re.compile(r"\b(?:safety )?goggles\b|\bsafety glasses\b")),
    ("Dissection kit", re.compile(r"\bdissect(?:ion|ing) kit\b")),
]
_LAPTOP_REQ = re.compile(r"\brequires? (?:the use of )?a laptop\b|\bwill require a laptop\b|"
                         r"\blaptop (?:is )?required\b|"
                         r"\b(?:required|expected) to bring (?:a|their own|your own) laptops?\b|"
                         r"\brequire the use of a laptop\b|\bneed to have a laptop\b|"
                         r"\ba laptop (?:with [^.]{0,40})?is required\b")
_LAPTOP_REC = re.compile(r"\b(?:encouraged|recommended) to bring (?:a|their own|your own) laptops?\b")
_CALC = re.compile(r"\b(?:scientific |graphing )?calculator\b")

# iClicker: what the text says about the remote and the app
_ICLICKER = re.compile(r"\bi>?clickers?\b")
_REMOTE = re.compile(r"\b(?:i>?clicker )?remotes?\b|\bphysical i>?clickers?\b")
_APP = re.compile(r"\bi>?clicker (?:cloud|student|reef|web)\b|"
                  r"\b(?:phone|mobile|student|cloud) app\b|\bi>?clicker app\b|\bi>?clicker (?:\w+ )?subscription\b")
_NO_APP = re.compile(r"\bnot (?:the |a )?(?:phone app|mobile app|app|i>?clicker (?:cloud|student app|reef))\b|"
                     r"\bapps? (?:is|are|will) not (?:be )?(?:accepted|allowed|permitted|compatible)\b|\bno apps?\b")
_NO_REMOTE = re.compile(r"\bremotes? (?:is|are|will) not (?:be )?(?:accepted|allowed|permitted|used)\b|"
                        r"\bnot (?:a |the )?(?:physical )?remotes?\b")
# "either the older iClicker+ or the newer iClicker 2" is two remotes, so "either" alone isn't a choice of option
_EITHER = re.compile(r"\bchoose\b|\beither (?:a |the |an )?(?:physical )?(?:i>?clicker )?(?:remote|app)\b|"
                     r"\bremotes? or\b|"
                     r"\bor (?:the |a |an )?(?:i>?clicker )?(?:cloud|web|student|reef|app|remote)")


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;])\s+|\n+", text or "")
    return [p.strip() for p in parts if p.strip()]


def _quote(sentence: str, m: re.Match[str] | None = None) -> str:
    s = re.sub(r"\s+", " ", sentence).strip()
    if len(s) <= QUOTE_LEN:
        return s
    start = max(0, (m.start() if m else 0) - 50)
    if start:  # begin at a word
        start = s.find(" ", start) + 1 or start
    return ("…" if start else "") + s[start:start + QUOTE_LEN].strip() + "…"


def _need(low: str, context: str | None) -> str | None:
    if _OPT.search(low):
        return "optional"
    if _REC.search(low):
        return "recommended"
    if _REQ.search(low):
        return "required"
    return context


def _money(*groups: str | None) -> str | None:
    return next((g for g in groups if g), None)


def _iclicker(sents: list[tuple[str, str | None]], source: str, url: str | None) -> list[Item]:
    """One decision per text: remote only, app only, either, or iClicker with the option not stated."""
    hits = [(s, ctx) for s, ctx in sents if _ICLICKER.search(s.lower())]
    if not hits:
        return []
    for s, _ctx in hits:
        low = s.lower()
        if _REMOTE.search(low) and (m := _NO_APP.search(low)):
            return [Item("iclicker-remote", "iClicker remote", _quote(s, m), source, "required", url=url)]
        if _APP.search(low) and (m := _NO_REMOTE.search(low)):
            return [Item("iclicker-subscription", "iClicker app subscription", _quote(s, m), source, "required",
                         url=url)]
    for s, _ in hits:
        low = s.lower()
        m = _EITHER.search(low) if _REMOTE.search(low) and _APP.search(low) else None
        m = m or re.search(r"\bi>?clickers? or (?:the )?i>?clicker (?:cloud|student|reef)", low)
        if m:
            q = _quote(s, m)
            return [Item("iclicker-remote", "iClicker remote", q, source, "choose-one", url=url),
                    Item("iclicker-subscription", "iClicker app subscription", q, source, "choose-one", url=url)]
    for s, ctx in hits:
        low = s.lower()
        if _REMOTE.search(low) and not _APP.search(low):
            return [Item("iclicker-remote", "iClicker remote", _quote(s), source, _need(low, ctx), url=url)]
        if _APP.search(low) and not _REMOTE.search(low):
            return [Item("iclicker-subscription", "iClicker app subscription", _quote(s), source, _need(low, ctx),
                         url=url)]
    s, ctx = hits[0]
    return [Item("iclicker", "iClicker", _quote(s), source, _need(s.lower(), ctx), url=url)]


def extract(text: str | list[tuple[str, str | None]], source: str, url: str | None = None) -> list[Item]:
    """Items supported by `text`. A list of (line, heading need) pairs carries a page's "Required Materials"-style
    headings, so a bare line under "Optional Materials" is optional."""
    lines: list[tuple[str, str | None]] = [(text, None)] if isinstance(text, str) else text
    sents = [(s, ctx) for line, ctx in lines for s in sentences(line)]
    found: list[Item] = []
    for s, ctx in sents:
        low = s.lower()
        if m := _DAY1.search(low):
            day1_url = "https://go.illinois.edu/Day1Access"
            found.append(Item("day1access", "Day1Access course materials", _quote(s, m), source, price=m.group(1),
                              url=day1_url))
        for title, pat in _FEE:
            if m := pat.search(low):
                found.append(Item("fee", title, _quote(s, m), source, "required", _money(*m.groups()), url))
        if m := _NO_TEXTBOOK.search(low):
            found.append(Item("textbook", "Textbook", _quote(s, m), source, "none", url=url))
        elif m := _TEXTBOOK_REQ.search(low):
            found.append(Item("textbook", "Textbook", _quote(s, m), source, "required", url=url))
        if m := _KEYCODE.search(low):
            price = re.search(MONEY, s)
            title = "e-textbook access code" if "textbook" in low.replace(" ", "") else "Online course materials"
            if "cengage" in low:
                title = "Cengage online resources"
            found.append(Item("access-code", title, _quote(s, m), source, _need(low, ctx),
                              price.group(0) if price else None, url))
        else:
            for title, pat in PAID:
                m = pat.search(low)
                if m and not (title == "ALEKS" and _PLACEMENT.search(low)):
                    found.append(Item("access-code", title, _quote(s, m), source, _need(low, ctx), url=url))
        for title, pat in FREE:
            if m := pat.search(s):
                found.append(Item("platform", title, _quote(s, m), source, price="free", url=url))
        for title, pat in _KIT:
            if (m := pat.search(low)) and (need := _need(low, ctx)):
                found.append(Item("lab-kit", title, _quote(s, m), source, need, url=url))
                break
        if m := _LAPTOP_REQ.search(low):
            found.append(Item("laptop", "Laptop", _quote(s, m), source, "required", url=url))
        elif m := _LAPTOP_REC.search(low):
            found.append(Item("laptop", "Laptop", _quote(s, m), source, "recommended", url=url))
        if (m := _CALC.search(low)) and (need := _need(low, ctx)):
            found.append(Item("calculator", "Calculator", _quote(s, m), source, need, url=url))
    # A book listed under a "Recommended" or "Optional Materials" heading: the whole line names it
    for line, ctx in lines:
        low = line.lower()
        if ctx in ("recommended", "optional") and (m := _BOOKISH.search(low)) and not _NO_TEXTBOOK.search(low):
            free = "free" if re.search(r"\bfree\b", low) else None
            found.append(Item("textbook", "Textbook", _quote(line, m), source, ctx, free, url))
    # smartPhysics: the line names it ("access the content at smart.physics...") and a sentence says to pay for a code
    for line, ctx in lines:
        if _SMART.search(line.lower()):
            for s in sentences(line):
                if m := re.search(r"\b(?:access code|pay for access|purchas\w* a code)\b", s.lower()):
                    found.append(Item("access-code", "smartPhysics", _quote(s, m), source, _need(s.lower(), ctx),
                                      url=url))
                    break
    # A page line such as "iClicker Remote. New or used any version, but not the phone app" decides as a whole
    found += _iclicker(sents if isinstance(text, str) else lines, source, url)
    return dedupe(found)


def drop_generic(items: list[dict]) -> list[dict]:
    """A course's list with each item once (two of its pages often say the same thing), and without "iClicker, option
    not stated" when another source says which option."""
    seen: dict[tuple, dict] = {}
    for i in items:
        what = i["quote"] if i["kind"] == "textbook" and i.get("need") != "none" else i.get("title")
        seen.setdefault((i["kind"], what, i.get("need"), i.get("price"), tuple(i.get("crns", ()))), i)
    out = list(seen.values())
    if any(i["kind"] in ("iclicker-remote", "iclicker-subscription") for i in out):
        return [i for i in out if i["kind"] != "iclicker"]
    return out


def dedupe(items: list[Item]) -> list[Item]:
    """One item per (kind, title, need, price); a "none" textbook loses to a textbook the same text requires."""
    seen: dict[tuple, Item] = {}
    for it in items:
        seen.setdefault(it.key(), it)
    out = list(seen.values())
    if any(i.kind == "textbook" and i.need not in ("none", None) for i in out):
        out = [i for i in out if not (i.kind == "textbook" and i.need == "none")]
    return out


# --- course pages -----------------------------------------------------------------------------------------------------

class _PageText(HTMLParser):
    """Visible lines of a page outside nav, script and style, each with the need its nearest heading implies."""

    BLOCK = {"p", "li", "div", "br", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "section"}
    SKIP = {"nav", "script", "style", "noscript", "head", "svg"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lines: list[tuple[str, str | None]] = []
        self.title = ""
        self._buf: list[str] = []
        self._skip = 0
        self._in_title = False
        self._heading: str | None = None
        self._context: str | None = None

    def _flush(self) -> None:
        line = re.sub(r"\s+", " ", "".join(self._buf)).strip()
        self._buf = []
        if not line:
            return
        if self._heading is not None:
            low = line.lower()
            self._context = ("optional" if "optional" in low else "recommended" if "recommended" in low
                             else "required" if "required" in low else None)
            return
        self.lines.append((line, self._context))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
        if tag in self.SKIP:
            self._skip += 1
        elif tag in self.BLOCK:
            self._flush()
            if re.fullmatch(r"h[1-6]", tag):
                self._heading = tag

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        if tag in self.SKIP:
            self._skip = max(0, self._skip - 1)
        elif tag in self.BLOCK:
            self._flush()
            if tag == self._heading:
                self._heading = None

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        elif not self._skip:
            self._buf.append(data)


def page_lines(html: str, course: str) -> list[tuple[str, str | None]] | None:
    """The page's lines, or None when it isn't this course's page (a department site answering 200 for any path)."""
    p = _PageText()
    p.feed(html)
    p.close()
    p._flush()
    code = r"\s*".join(re.escape(w) for w in course.split())
    if not re.search(code, p.title, re.I) and not any(re.search(code, ln, re.I) for ln, _ in p.lines[:5]):
        return None
    return p.lines


def term_slug(term: str) -> str:
    """'2026-fa' -> 'fa2026', the term part of courses.grainger.illinois.edu URLs."""
    year, season = term.split("-")
    return f"{season}{year}"


def load_pages(path: Path = PAGES_CSV) -> list[tuple[str, str, str]]:
    """(subject, number, url template) rows; `{term}` in a URL is replaced by the term slug."""
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.startswith("#")]
    rows = []
    for r in csv.DictReader(lines):
        subj, num = r["course"].split()
        rows.append((subj.upper(), num, r["url"].strip()))
    return rows


class Fetcher:
    """GET with robots.txt, a disk cache and at most one request a second. `get` returns (html, read date) or None."""

    def __init__(self, cache: Path = CACHE, client: Any = None, max_age_days: float = CACHE_DAYS,
                 delay: float = 1.0) -> None:
        self.cache, self.client, self.max_age, self.delay = cache, client, timedelta(days=max_age_days), delay
        self._robots: dict[str, RobotFileParser] = {}
        self._last = 0.0

    def _path(self, url: str) -> Path:
        u = urlsplit(url)
        return self.cache / u.netloc / (u.path.strip("/").replace("/", "__") or "index")

    def _wait(self) -> None:
        pause = self.delay - (time.monotonic() - self._last)
        if pause > 0:
            time.sleep(pause)
        self._last = time.monotonic()

    def _client(self) -> Any:
        if self.client is None:
            import httpx

            self.client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=False)
        return self.client

    def allowed(self, url: str) -> bool:
        u = urlsplit(url)
        if u.scheme != "https" or not (u.netloc == "illinois.edu" or u.netloc.endswith(".illinois.edu")):
            return False
        if u.netloc not in self._robots:
            rp = RobotFileParser()
            self._wait()
            try:
                r = self._client().get(f"https://{u.netloc}/robots.txt")
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except Exception:  # noqa: BLE001 - no robots.txt answer: read nothing from that host
                rp.parse(["User-agent: *", "Disallow: /"])
            self._robots[u.netloc] = rp
        return self._robots[u.netloc].can_fetch(USER_AGENT, url)

    def get(self, url: str) -> tuple[str, str] | None:
        path = self._path(url)
        miss = path.with_suffix(".missing")
        now = datetime.now(UTC)
        for p in (path, miss):
            if p.exists() and now - datetime.fromtimestamp(p.stat().st_mtime, UTC) < self.max_age:
                if p is miss:
                    return None
                return p.read_text(encoding="utf-8"), datetime.fromtimestamp(p.stat().st_mtime, UTC).date().isoformat()
        if not self.allowed(url):
            return None
        self._wait()
        try:
            r = self._client().get(url)
        except Exception:  # noqa: BLE001 - a page that can't be read this build adds nothing
            return None
        path.parent.mkdir(parents=True, exist_ok=True)
        if r.status_code != 200:
            miss.write_text(str(r.status_code), encoding="utf-8")
            path.unlink(missing_ok=True)
            return None
        path.write_text(r.text, encoding="utf-8")
        miss.unlink(missing_ok=True)
        return r.text, now.date().isoformat()


def read_pages(terms: list[str], fetcher: Fetcher | None, pages: list[tuple[str, str, str]]) -> dict[tuple, list[dict]]:
    """Items from each listed course page, per (term, subject, number)."""
    out: dict[tuple, list[dict]] = defaultdict(list)
    if fetcher is None:
        return out
    for term in terms:
        for subj, num, tmpl in pages:
            url = tmpl.replace("{term}", term_slug(term))
            got = fetcher.get(url)
            if not got:
                continue
            lines = page_lines(got[0], f"{subj} {num}")
            if lines is None:
                continue
            for it in extract(lines, PAGE, url):
                out[(term, subj, num)].append({**it.record(), "read_on": got[1]})
    return out


# --- run --------------------------------------------------------------------------------------------------------------

def course_items(term: str, info: str, sections: list[tuple[str, str]], read_on: str) -> list[dict]:
    """One course's items from Course Explorer: its section information (every section) and each section's text. An
    item found in every section is listed once for the course; otherwise it names its sections' CRNs."""
    course_wide = extract(info, CE_INFO)
    out = [{**it.record(), "read_on": read_on} for it in course_wide]
    have = {it.key() for it in course_wide}
    by_key: dict[tuple, tuple[Item, list[str]]] = {}
    for crn, text in sections:
        for it in extract(text, CE_TEXT):
            if it.key() in by_key:
                by_key[it.key()][1].append(crn)
            else:
                by_key[it.key()] = (it, [crn])
    all_crns = {crn for crn, _ in sections}
    for key, (it, crns) in by_key.items():
        if key in have:
            continue
        rec = {**it.record(), "read_on": read_on}
        if set(crns) != all_crns:
            rec["crns"] = sorted(set(crns))
        out.append(rec)
    return out


def run(conn: sqlite3.Connection, terms: list[str], fetcher: Fetcher | None = None,
        pages: list[tuple[str, str, str]] | None = None) -> str:
    conn.execute("DELETE FROM materials")
    marks = ",".join("?" * len(terms))
    read_on = {r[0]: (r[1] or "")[:10]
               for r in conn.execute(f"SELECT term, checked_at FROM terms WHERE term IN ({marks})", terms)}
    info = {(r[0], r[1], r[2]): " ".join(filter(None, r[3:5])) for r in conn.execute(
        f"SELECT term, subject, number, section_info_text, schedule_info_text FROM courses WHERE term IN ({marks})",
        terms)}
    secs: dict[tuple, list[tuple[str, str]]] = defaultdict(list)
    for r in conn.execute(f"SELECT term, subject, number, crn, section_text, section_notes FROM sections "
                          f"WHERE term IN ({marks}) ORDER BY crn", terms):
        secs[(r[0], r[1], r[2])].append((r[3], " ".join(filter(None, r[4:6]))))
    from_pages = read_pages(terms, fetcher, pages if pages is not None else (load_pages() if fetcher else []))
    n_items = n_courses = 0
    for key in sorted(set(info) | set(secs) | set(from_pages)):
        items = course_items(key[0], info.get(key, ""), secs.get(key, []), read_on.get(key[0], ""))
        items = drop_generic(items + from_pages.get(key, []))
        if not items:
            continue
        conn.execute("INSERT OR REPLACE INTO materials VALUES (?,?,?,?)", (*key, json.dumps(items)))
        n_items += len(items)
        n_courses += 1
    n_pages = sum(len(v) for v in from_pages.values())
    return f"{n_items} items for {n_courses} course-terms ({n_pages} from course pages)"


# Pages the tests read (fixtures/course-pages/): PHYS 100 is remote only (the app is "not compatible"), PHYS 102
# remote or app, PHYS 211 has "Required" and "Optional Materials" headings, ME 200 is a department page
FIXTURE_PAGES = [
    ("PHYS 100", "https://courses.grainger.illinois.edu/PHYS100/fa2026/iclicker.html"),
    ("PHYS 102", "https://courses.grainger.illinois.edu/PHYS102/fa2026/iclicker.html"),
    ("PHYS 211", "https://courses.grainger.illinois.edu/PHYS211/fa2026/required-materials.html"),
    ("ME 200", "https://courses.grainger.illinois.edu/ME200/fa2026/iclicker.html"),
]


def save_fixtures(out: Path, fetcher: Fetcher | None = None) -> list[Path]:
    """Save FIXTURE_PAGES as the site sent them: `python -m pipeline.materials_text --save-fixtures`."""
    fetcher = fetcher or Fetcher(max_age_days=0)
    out.mkdir(parents=True, exist_ok=True)
    saved = []
    for course, url in FIXTURE_PAGES:
        got = fetcher.get(url)
        if not got:
            raise SystemExit(f"couldn't read {url}")
        path = out / f"{course.replace(' ', '')}-{url.rsplit('/', 1)[1]}"
        path.write_text(got[0], encoding="utf-8")
        saved.append(path)
    return saved


def main(argv: list[str] | None = None) -> int:
    import argparse

    from .config import FIXTURES

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--save-fixtures", action="store_true", help="save the test pages to fixtures/course-pages/")
    args = ap.parse_args(argv)
    if args.save_fixtures:
        for p in save_fixtures(FIXTURES / "course-pages"):
            print(p)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
