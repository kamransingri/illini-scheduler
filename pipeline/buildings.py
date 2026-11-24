"""Map 1 (#93): a latitude and longitude for every building name in the section data, from OpenStreetMap.

One Overpass query fetches every named building, campus place (hospitals, museums, residence halls...) and addressed
building in a box around campus. It is cached in data/raw/osm/ for CACHE_DAYS. A meeting's building name (the `b`
field of course pages) is matched to an OSM name after normalising case, "&" and punctuation, never by similarity.
Abbreviated and old names go through data/buildings.csv, checked by hand (docs/DECISIONS.md D46). Street-address
names ("1205 W Nevada") match an OSM building with that house number on that street.

    python -m pipeline.buildings           # coverage and the names with no location, from data/illini.db
    python -m pipeline.buildings --fetch   # refresh the OSM extract first

Map data © OpenStreetMap contributors, under the Open Database License (ODbL); the export credits it.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from . import db
from .config import DATA, RAW, USER_AGENT

ALIASES = DATA / "buildings.csv"
CACHE = RAW / "osm" / "campus.json"
CACHE_DAYS = 7
CREDIT = "© OpenStreetMap contributors, ODbL (openstreetmap.org/copyright)"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

# Urbana-Champaign campus, Research Park and the South Farms; street addresses only in the core of campus.
BBOX = "40.070,-88.260,40.125,-88.190"
CORE = "40.095,-88.240,40.118,-88.200"
QUERY = f"""[out:json][timeout:120];
(
  nwr["building"]["name"]({BBOX});
  nwr["name"]["amenity"~"^(hospital|veterinary|university|college|library|arts_centre|theatre|clinic|research_institute)$"]({BBOX});
  nwr["name"]["tourism"="museum"]({BBOX});
  nwr["name"]["man_made"="observatory"]({BBOX});
  nwr["name"~"Residence Hall"]({BBOX});
  way["building"]["addr:housenumber"]["addr:street"]({CORE});
);
out center tags;"""

NAME_TAGS = ("name", "official_name", "alt_name", "short_name", "old_name")
NO_PLACE = {"", "n.a.", "na", "tba", "arranged", "online", "location pending"}  # meetings with no building
OFF = "-"  # data/buildings.csv: decided on purpose, no location (off campus, or not one building)


class BuildingsUnavailable(RuntimeError):
    """OpenStreetMap couldn't be reached and nothing is cached."""


def norm(s: str) -> str:
    """'Literatures, Cultures, & Linguistics' -> 'literatures cultures and linguistics'."""
    s = s.lower().replace("&", " and ").replace("’", "'")
    return " ".join(re.sub(r"[^a-z0-9/ ]", " ", s).split())


_DIRS = {"w": "west", "e": "east", "n": "north", "s": "south"}
_SUFFIX = {"street", "st", "avenue", "ave", "drive", "dr", "road", "rd", "court", "ct", "boulevard", "blvd", "place",
           "pl", "lane", "ln"}
_ADDR = re.compile(r"^(\d+(?: 1/2)?)\s+(.+)$")


def addr_key(number: str, street: str) -> str:
    """('1205', 'West Nevada Street') and ('1205', 'W Nevada') -> '1205 west nevada'."""
    words = [_DIRS.get(w, w) for w in norm(street.replace(".", "")).split()]
    while words and words[-1] in _SUFFIX:
        words.pop()
    return f"{norm(number)} {' '.join(words)}"


@dataclass(frozen=True)
class Place:
    osm: str              # "way/137918168"
    name: str             # OSM `name`
    short: str | None     # OSM `short_name`
    lat: float
    lon: float
    rank: int             # lower wins when two places share a name: buildings before amenities before points
    tags: dict[str, str] = field(default_factory=dict, compare=False, repr=False)


def load_osm(path: Path) -> tuple[list[Place], str]:
    """Places from a saved Overpass answer, and the OSM data's timestamp."""
    doc = json.loads(path.read_text())
    out = []
    for e in doc.get("elements", []):
        tags = e.get("tags", {})
        c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        if c.get("lat") is None:
            continue
        name = tags.get("name") or ""
        if not name and "addr:housenumber" not in tags:
            continue
        rank = (0 if "building" in tags else 1) * 2 + (0 if e["type"] in ("way", "relation") else 1)
        out.append(Place(f"{e['type']}/{e['id']}", name, tags.get("short_name"), round(c["lat"], 6),
                         round(c["lon"], 6), rank, tags))
    return out, doc.get("osm3s", {}).get("timestamp_osm_base", "")


@dataclass(frozen=True)
class Alias:
    name: str   # the name as the section data has it
    osm: str    # an OSM name, or OFF
    note: str


def load_aliases(path: Path = ALIASES) -> dict[str, Alias]:
    """data/buildings.csv: name,osm,note. '#' lines are comments. Rows with osm '-' need a note saying why."""
    out: dict[str, Alias] = {}
    with path.open(newline="") as f:
        rows = csv.DictReader(line for line in f if not line.startswith("#"))
        for r in rows:
            a = Alias(r["name"].strip(), r["osm"].strip(), (r.get("note") or "").strip())
            if not a.name or not a.osm:
                raise ValueError(f"{path.name}: every row needs a name and an osm value: {r}")
            if a.osm == OFF and not a.note:
                raise ValueError(f"{path.name}: {a.name!r} has no location, so its note must say why")
            if norm(a.name) in {norm(k) for k in out}:
                raise ValueError(f"{path.name}: {a.name!r} is listed twice")
            out[a.name] = a
    return out


@dataclass
class Locator:
    places: list[Place]
    aliases: dict[str, Alias]
    by_name: dict[str, Place] = field(init=False)
    by_addr: dict[str, Place] = field(init=False)

    def __post_init__(self) -> None:
        self.by_name, self.by_addr = {}, {}
        for p in sorted(self.places, key=lambda p: (p.rank, p.osm)):
            tags = p.tags
            for k in NAME_TAGS:
                for v in tags.get(k, p.name if k == "name" else "").split(";"):
                    if v.strip():
                        self.by_name.setdefault(norm(v), p)
            if tags.get("addr:housenumber") and tags.get("addr:street"):
                self.by_addr.setdefault(addr_key(tags["addr:housenumber"], tags["addr:street"]), p)
        self._aliases = {norm(k): a for k, a in self.aliases.items()}

    def locate(self, building: str) -> Place | str | None:
        """The place for a section's building name; OFF when data/buildings.csv says it has none; None if unknown."""
        a = self._aliases.get(norm(building))
        if a is not None:
            return OFF if a.osm == OFF else self.by_name.get(norm(a.osm))
        hit = self.by_name.get(norm(building))
        if hit is None and (m := _ADDR.match(building.strip())):
            hit = self.by_addr.get(addr_key(m.group(1), m.group(2)))
        return hit

    def broken_aliases(self) -> list[Alias]:
        """Alias rows whose OSM name isn't in the extract (a typo, or the building was renamed in OSM)."""
        return [a for a in self.aliases.values() if a.osm != OFF and norm(a.osm) not in self.by_name]


def fetched_at(cache: Path) -> datetime:
    """When the cached answer was fetched; the epoch (always stale) if the file doesn't say or can't be read."""
    try:
        return datetime.fromisoformat(json.loads(cache.read_text())["fetched_at"])
    except (OSError, ValueError, KeyError, TypeError):
        return datetime.fromtimestamp(0, UTC)


def fetch(cache: Path = CACHE, max_age_days: float = CACHE_DAYS, transport: Any = None) -> Path:
    """The cached Overpass answer if it's fresh, else a new one. A stale cache is used when OSM can't be reached.

    Freshness is the `fetched_at` saved inside the file, not its modification time, which a restored CI cache resets."""
    if cache.exists() and datetime.now(UTC) - fetched_at(cache) < timedelta(days=max_age_days):
        return cache
    errors = []
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=150, transport=transport) as client:
        for url in OVERPASS:
            try:
                r = client.post(url, data={"data": QUERY})
                r.raise_for_status()
                doc = r.json()
                if not doc.get("elements"):
                    raise ValueError("no elements")
            except (httpx.HTTPError, ValueError) as e:
                errors.append(f"{url}: {e.__class__.__name__}")
                continue
            cache.parent.mkdir(parents=True, exist_ok=True)
            tmp = cache.with_suffix(".part")
            doc["fetched_at"] = datetime.now(UTC).isoformat(timespec="seconds")
            tmp.write_text(json.dumps(doc))
            tmp.replace(cache)
            return cache
    if cache.exists():
        return cache
    raise BuildingsUnavailable("; ".join(errors))


@dataclass
class Report:
    located: int = 0
    off: int = 0
    missing: Counter[str] = field(default_factory=Counter)  # name -> next-term meetings
    next_total: int = 0      # next-term in-person meetings (off-campus ones not counted)
    next_located: int = 0
    broken: list[str] = field(default_factory=list)

    @property
    def share(self) -> float:
        return self.next_located / self.next_total if self.next_total else 0.0

    def __str__(self) -> str:
        s = (f"{self.located} buildings located, {self.off} off campus, {len(self.missing)} with no location; "
             f"{self.share:.1%} of next term's in-person meetings ({self.next_located}/{self.next_total})")
        if self.missing:
            s += "\n    no location: " + ", ".join(f"{n} ({c})" for n, c in self.missing.most_common())
        if self.broken:
            s += "\n    data/buildings.csv names not in OpenStreetMap: " + ", ".join(self.broken)
        return s


def run(conn: sqlite3.Connection, osm_path: Path, next_term: str, aliases: dict[str, Alias] | None = None) -> Report:
    """Locate every building name in `meetings` (all loaded terms) and store the `buildings` table."""
    places, osm_base = load_osm(osm_path)
    loc = Locator(places, load_aliases() if aliases is None else aliases)
    rep = Report(broken=[a.name for a in loc.broken_aliases()])
    counts: Counter[str] = Counter()
    nxt: Counter[str] = Counter()
    for b, term, n in conn.execute("SELECT building, term, COUNT(*) FROM meetings GROUP BY building, term"):
        b = (b or "").strip()
        if b.lower() in NO_PLACE:
            continue
        counts[b] += n
        if term == next_term:
            nxt[b] += n
    conn.execute("DELETE FROM buildings")
    rows = []
    for b in sorted(counts):
        hit = loc.locate(b)
        if hit == OFF:
            rep.off += 1
            continue
        rep.next_total += nxt[b]
        if isinstance(hit, Place):
            rep.located += 1
            rep.next_located += nxt[b]
            rows.append((b, hit.name, hit.short, hit.lat, hit.lon, hit.osm))
        else:
            rep.missing[b] = nxt[b]
    conn.executemany("INSERT INTO buildings (building, osm_name, short_name, lat, lon, osm_id) VALUES (?,?,?,?,?,?)",
                     rows)
    db.set_meta(conn, "buildings_osm_base", osm_base)
    db.set_meta(conn, "buildings_share", f"{rep.share:.4f}")
    return rep


def export_rows(conn: sqlite3.Connection) -> dict[str, dict]:
    """buildings.json's `buildings`: section building name -> {name, short, lat, lon}."""
    return {r[0]: {"name": r[1], "short": r[2], "lat": r[3], "lon": r[4]}
            for r in conn.execute("SELECT building, osm_name, short_name, lat, lon FROM buildings ORDER BY building")}


def save_fixture(conn: sqlite3.Connection, osm_path: Path, out: Path, aliases: dict[str, Alias]) -> int:
    """fixtures/osm/campus.json: the OSM elements the stored names and every alias row point at, plus every other
    element sharing one of their names (so the tie-break is tested), with only the tags the locator reads."""
    doc = json.loads(osm_path.read_text())
    ids = {r[0] for r in conn.execute("SELECT osm_id FROM buildings")}
    places, _ = load_osm(osm_path)
    loc = Locator(places, aliases)
    ids |= {loc.by_name[norm(a.osm)].osm for a in aliases.values() if a.osm != OFF and norm(a.osm) in loc.by_name}
    wanted = {norm(p.name) for p in places if p.osm in ids}
    keep = ("name", *NAME_TAGS, "building", "amenity", "tourism", "man_made", "addr:housenumber", "addr:street")
    els = []
    for e in doc["elements"]:
        if f"{e['type']}/{e['id']}" in ids or norm(e.get("tags", {}).get("name", "")) in wanted:
            slim = {k: v for k, v in e.items() if k in ("type", "id", "lat", "lon", "center")}
            slim["tags"] = {k: v for k, v in e.get("tags", {}).items() if k in keep}
            els.append(slim)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"osm3s": doc.get("osm3s", {}), "elements": els}, indent=0, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    return len(els)


def main(argv: list[str] | None = None) -> int:
    from .config import DB_PATH, FIXTURES
    from .fetch import NEXT_TERM

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", action="store_true", help="refresh the OpenStreetMap extract first")
    ap.add_argument("--save-fixture", action="store_true",
                    help="write fixtures/osm/campus.json: only the OSM elements the tests need")
    args = ap.parse_args(argv)
    if not DB_PATH.exists():
        print(f"no {DB_PATH}: run `make data` first")
        return 1
    path = fetch(max_age_days=0) if args.fetch or not CACHE.exists() else CACHE
    conn = db.connect(DB_PATH)
    print(run(conn, path, NEXT_TERM))
    conn.commit()
    if args.save_fixture:
        print(f"{save_fixture(conn, path, FIXTURES / 'osm' / 'campus.json', load_aliases())} elements saved")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
