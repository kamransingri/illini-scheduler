"""Map 4 (#96): MTD's published bus timetable (GTFS) as one small file for the schedule builder.

MTD publishes its whole timetable as a GTFS zip, with no key needed (developer.mtd.org). The site needs only the
buses near campus on a normal week of classes, so this keeps:

- **stops** within STOP_RADIUS metres of a class building (`buildings`, #93) or a place to live;
- **a typical week:** for each weekday, the set of services that runs on most of that weekday's dates in the feed
  (holidays and break days run something else and drop out);
- **trips** that call at two or more of those stops, grouped into patterns: the same route, headsign, stops and
  minutes between them, with one start time per trip. 3,600 trips become ~500 patterns, ~140 KB.

Places to live are OpenStreetMap's named residence halls and apartment buildings (the cached #93 extract).

The timetable is MTD's: the export carries "Data provided by Champaign-Urbana Mass Transit District", which MTD's
developer terms ask for, and the site shows it next to every bus time. The feed covers one term at a time, so a
schedule for a term MTD hasn't published uses the current term's times, and the site says so (DECISIONS.md D47).

    python -m pipeline.transit           # what the export would hold, from data/illini.db and the cached feed
    python -m pipeline.transit --fetch   # download the feed first
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sqlite3
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from . import buildings, db
from .config import RAW, USER_AGENT

GTFS_URL = "https://developer.mtd.org/gtfs/google_transit.zip"
CACHE = RAW / "mtd" / "google_transit.zip"
STAMP = RAW / "mtd" / "fetched.json"   # when the zip was downloaded (a restored CI cache resets file dates)
CACHE_DAYS = 7                          # MTD changes the feed every few months
CREDIT = "Data provided by Champaign-Urbana Mass Transit District"
STOP_RADIUS = 500                       # metres: about a 6-minute walk
HOME_KINDS = {"dormitory": "hall", "apartments": "apartments"}


class TransitUnavailable(RuntimeError):
    """MTD's feed couldn't be downloaded and nothing is cached."""


def metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(a))


def fetch(cache: Path = CACHE, stamp: Path = STAMP, max_age_days: float = CACHE_DAYS, transport: Any = None) -> Path:
    """The cached feed if it's fresh, else a new download; a stale copy when MTD can't be reached."""
    try:
        when = datetime.fromisoformat(json.loads(stamp.read_text())["fetched_at"])
    except (OSError, ValueError, KeyError, TypeError):
        when = datetime.fromtimestamp(0, UTC)
    if cache.exists() and datetime.now(UTC) - when < timedelta(days=max_age_days):
        return cache
    try:
        with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=120, follow_redirects=True,
                          transport=transport) as client:
            r = client.get(GTFS_URL)
            r.raise_for_status()
            zipfile.ZipFile(io.BytesIO(r.content)).testzip()  # a broken download raises here
    except (httpx.HTTPError, zipfile.BadZipFile) as e:
        if cache.exists():
            return cache
        raise TransitUnavailable(f"{GTFS_URL}: {e.__class__.__name__}") from e
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(".part")
    tmp.write_bytes(r.content)
    tmp.replace(cache)
    stamp.write_text(json.dumps({"fetched_at": datetime.now(UTC).isoformat(timespec="seconds")}))
    return cache


def _rows(z: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    if name not in z.namelist():
        return []
    with z.open(name) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))


def _minutes(t: str) -> int:
    """'25:07:00' -> 1507 (GTFS times run past midnight on late trips)."""
    h, m, _ = t.split(":")
    return int(h) * 60 + int(m)


def typical_week(z: zipfile.ZipFile) -> tuple[dict[str, int], dict[int, str]]:
    """{service_id: weekday bit mask (Monday 1 ... Sunday 64)} for a normal week, and one example date per weekday.

    Each weekday takes the set of services running on most of its dates in the feed, so holidays and breaks (which
    run a different set) don't count. Services come from calendar.txt and calendar_dates.txt (MTD uses only the
    second, with every service listed date by date)."""
    on: dict[date, set[str]] = defaultdict(set)
    for r in _rows(z, "calendar.txt"):
        d0, d1 = (datetime.strptime(r[k], "%Y%m%d").date() for k in ("start_date", "end_date"))
        days = [r[k] == "1" for k in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")]
        d = d0
        while d <= d1:
            if days[d.weekday()]:
                on[d].add(r["service_id"])
            d += timedelta(days=1)
    for r in _rows(z, "calendar_dates.txt"):
        d = datetime.strptime(r["date"], "%Y%m%d").date()
        (on[d].add if r["exception_type"] == "1" else on[d].discard)(r["service_id"])
    masks: dict[str, int] = defaultdict(int)
    example: dict[int, str] = {}
    for wd in range(7):
        sets = Counter(frozenset(s) for d, s in on.items() if d.weekday() == wd and s)
        if not sets:
            continue
        common = sets.most_common(1)[0][0]
        example[wd] = min(d for d, s in on.items() if d.weekday() == wd and frozenset(s) == common).isoformat()
        for sid in common:
            masks[sid] |= 1 << wd
    return dict(masks), example


@dataclass(frozen=True)
class Home:
    name: str
    kind: str     # "hall" or "apartments"
    lat: float
    lon: float


def homes_from_osm(osm_path: Path) -> list[Home]:
    """Named residence halls and apartment buildings in the cached OpenStreetMap extract, one per name."""
    places, _ = buildings.load_osm(osm_path)
    out: dict[str, Home] = {}
    for p in sorted(places, key=lambda p: (p.rank, p.osm)):
        kind = HOME_KINDS.get(p.tags.get("building", ""))
        if kind is None and "residence hall" in p.name.lower() and not p.osm.startswith("node/"):
            kind = "hall"  # a hall complex drawn as an area; OSM's points named "... Residence Hall" duplicate it
        if kind and p.name and p.name not in out:
            out[p.name] = Home(p.name, kind, p.lat, p.lon)
    return sorted(out.values(), key=lambda h: (h.kind != "hall", h.name))


def build(gtfs: Path, points: list[tuple[float, float]], homes: list[Home]) -> dict[str, Any]:
    """The transit.json document (docs/API.md) for stops near `points` and `homes`."""
    z = zipfile.ZipFile(gtfs)
    feed = next(iter(_rows(z, "feed_info.txt")), {})
    masks, example = typical_week(z)
    where = points + [(h.lat, h.lon) for h in homes]
    stops: dict[str, tuple[str, float, float]] = {}
    for r in _rows(z, "stops.txt"):
        if r.get("location_type", "0") not in ("", "0"):
            continue  # stations, not stops a bus calls at
        lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
        if any(metres(lat, lon, a, b) <= STOP_RADIUS for a, b in where):
            stops[r["stop_id"]] = (r["stop_name"], round(lat, 6), round(lon, 6))
    trips = {r["trip_id"]: r for r in _rows(z, "trips.txt") if r["service_id"] in masks}
    calls: dict[str, list[tuple[int, str, int]]] = defaultdict(list)
    with z.open("stop_times.txt") as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            if r["trip_id"] in trips and r["stop_id"] in stops and (r["departure_time"] or r["arrival_time"]):
                calls[r["trip_id"]].append((int(r["stop_sequence"]), r["stop_id"],
                                            _minutes(r["departure_time"] or r["arrival_time"])))
    stop_ix: dict[str, int] = {}
    route_ix: dict[str, int] = {}
    routes = {r["route_id"]: r for r in _rows(z, "routes.txt")}
    patterns: dict[tuple, list[list[int]]] = defaultdict(list)
    for tid, cs in calls.items():
        if len(cs) < 2:
            continue
        cs.sort()
        trip = trips[tid]
        t0 = cs[0][2]
        key = (trip["route_id"], trip.get("trip_headsign", ""), tuple(c[1] for c in cs), tuple(c[2] - t0 for c in cs))
        patterns[key].append([t0, masks[trip["service_id"]]])
    out_patterns = []
    for (rid, head, sids, offs), starts in sorted(patterns.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2])):
        ri = route_ix.setdefault(rid, len(route_ix))
        out_patterns.append({"r": ri, "h": head, "s": [stop_ix.setdefault(s, len(stop_ix)) for s in sids],
                             "o": list(offs), "t": sorted(starts)})
    by_ix = sorted(stop_ix, key=stop_ix.__getitem__)
    rlist = sorted(route_ix, key=route_ix.__getitem__)
    return {
        "credit": CREDIT,
        "feed": {"version": feed.get("feed_version") or None, "start": _iso(feed.get("feed_start_date")),
                 "end": _iso(feed.get("feed_end_date"))},
        "week": {str(k): v for k, v in sorted(example.items())},
        "routes": [[routes[r].get("route_short_name", ""), routes[r].get("route_long_name", ""),
                    routes[r].get("route_color", ""), routes[r].get("route_text_color", "")] for r in rlist],
        "stops": [list(stops[s]) for s in by_ix],
        "patterns": out_patterns,
        "homes": [{"name": h.name, "kind": h.kind, "lat": h.lat, "lon": h.lon} for h in homes],
    }


def _iso(d: str | None) -> str | None:
    return f"{d[:4]}-{d[4:6]}-{d[6:]}" if d and len(d) == 8 else None


EMPTY: dict[str, Any] = {"credit": CREDIT, "feed": {"version": None, "start": None, "end": None}, "week": {},
                         "routes": [], "stops": [], "patterns": [], "homes": []}


def run(conn: sqlite3.Connection, gtfs: Path | None, osm_path: Path | None) -> str:
    """Build the export from the located buildings and store it (transit_export). `gtfs` None: an empty export."""
    points = [(r[0], r[1]) for r in conn.execute("SELECT lat, lon FROM buildings")]
    homes = homes_from_osm(osm_path) if osm_path is not None else []
    doc: dict[str, Any] = (build(gtfs, points, homes) if gtfs is not None
                           else {**EMPTY, "homes": [h.__dict__ for h in homes]})
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False)
    conn.execute("DELETE FROM transit_export")
    conn.execute("INSERT INTO transit_export (id, doc) VALUES (1, ?)", (text,))
    db.set_meta(conn, "transit_feed_end", doc["feed"]["end"] or "")
    trips = sum(len(p["t"]) for p in doc["patterns"])
    return (f"{len(doc['stops'])} stops, {len(doc['routes'])} routes, {trips} trips in {len(doc['patterns'])} "
            f"patterns, {len(doc['homes'])} places to live; feed until {doc['feed']['end']}; {len(text) // 1024} KB")


def export_doc(conn: sqlite3.Connection) -> dict[str, Any]:
    row = conn.execute("SELECT doc FROM transit_export WHERE id = 1").fetchone()
    return json.loads(row[0]) if row else EMPTY


FIXTURE_ROUTES = ("ILLINI", "SILVER")  # the two routes most students ride between halls and class


def save_fixture(gtfs: Path, out: Path, routes: tuple[str, ...] = FIXTURE_ROUTES, month: str = "202609") -> int:
    """fixtures/mtd/google_transit.zip: the real feed cut to a few daytime routes, one month of dates and the stops in
    the core of campus, with every file the importer reads. Rows are copied unchanged."""
    z = zipfile.ZipFile(gtfs)
    keep_routes = {r["route_id"] for r in _rows(z, "routes.txt") if r["route_id"] in routes}
    south, west, north, east = (float(x) for x in buildings.CORE.split(","))
    core = {r["stop_id"] for r in _rows(z, "stops.txt")
            if south <= float(r["stop_lat"]) <= north and west <= float(r["stop_lon"]) <= east}
    trips = [r for r in _rows(z, "trips.txt") if r["route_id"] in keep_routes]
    services = {r["service_id"] for r in trips}
    dates = [r for r in _rows(z, "calendar_dates.txt") if r["service_id"] in services and r["date"].startswith(month)]
    services &= {r["service_id"] for r in dates}
    trips = [r for r in trips if r["service_id"] in services]
    tids = {r["trip_id"] for r in trips}
    with z.open("stop_times.txt") as f:
        times = [r for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
                 if r["trip_id"] in tids and r["stop_id"] in core]
    sids = {r["stop_id"] for r in times}
    files = {
        "feed_info.txt": _rows(z, "feed_info.txt"), "agency.txt": _rows(z, "agency.txt"),
        "routes.txt": [r for r in _rows(z, "routes.txt") if r["route_id"] in keep_routes],
        "calendar_dates.txt": dates, "trips.txt": trips, "stop_times.txt": times,
        "stops.txt": [r for r in _rows(z, "stops.txt") if r["stop_id"] in sids],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zo:
        for name, rows in files.items():
            buf = io.StringIO()
            w = csv.DictWriter(buf, fieldnames=list(rows[0]), lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
            zo.writestr(name, buf.getvalue())
    return len(times)


def main(argv: list[str] | None = None) -> int:
    from .config import DB_PATH, FIXTURES

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", action="store_true", help="download MTD's feed first")
    ap.add_argument("--save-fixture", action="store_true",
                    help=f"write fixtures/mtd/google_transit.zip: {', '.join(FIXTURE_ROUTES)} in September")
    args = ap.parse_args(argv)
    if args.save_fixture:
        print(f"{save_fixture(CACHE, FIXTURES / 'mtd' / 'google_transit.zip')} stop times saved")
        return 0
    if not DB_PATH.exists():
        print(f"no {DB_PATH}: run `make data` first")
        return 1
    gtfs = fetch(max_age_days=0) if args.fetch or not CACHE.exists() else CACHE
    conn = db.connect(DB_PATH)
    print(run(conn, gtfs, buildings.CACHE if buildings.CACHE.exists() else None))
    conn.commit()
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
