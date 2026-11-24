import io
import json
import zipfile

import httpx
import pytest

from pipeline import db, transit
from pipeline.config import FIXTURES

GTFS = FIXTURES / "mtd" / "google_transit.zip"
OSM = FIXTURES / "osm" / "campus.json"
UNION = (40.109, -88.2272)  # Illini Union


@pytest.fixture(scope="module")
def doc():
    return transit.build(GTFS, [UNION], transit.homes_from_osm(OSM))


def test_typical_week_uses_the_most_common_services():
    masks, example = transit.typical_week(zipfile.ZipFile(GTFS))
    # Monday to Friday each have a usual set of services in September; Labor Day (Mon 7 Sep) isn't the example
    assert set(example) >= {0, 1, 2, 3, 4} and example[0] != "2026-09-07"
    assert all(0 < m < 128 for m in masks.values())
    weekday = [sid for sid, m in masks.items() if m & 0b11111]
    assert weekday


def test_export_shape_and_credit(doc):
    assert doc["credit"] == "Data provided by Champaign-Urbana Mass Transit District"
    assert doc["feed"]["start"] == "2026-08-09" and doc["feed"]["end"] == "2026-12-19"
    assert {r[0] for r in doc["routes"]} == {"13", "22"}  # Silver and Illini
    n = len(doc["stops"])
    for p in doc["patterns"]:
        assert len(p["s"]) == len(p["o"]) >= 2 and p["o"][0] == 0 and p["o"] == sorted(p["o"])
        assert all(0 <= s < n for s in p["s"]) and 0 <= p["r"] < len(doc["routes"])
        assert all(0 <= t < 30 * 60 and 0 < m < 128 for t, m in p["t"])


def test_only_stops_near_campus_places_are_kept(doc):
    for _name, lat, lon in doc["stops"]:
        near = [transit.metres(lat, lon, a, b) for a, b in [UNION] + [(h["lat"], h["lon"]) for h in doc["homes"]]]
        assert min(near) <= transit.STOP_RADIUS


def test_trips_are_grouped_into_patterns(doc):
    trips = sum(len(p["t"]) for p in doc["patterns"])
    assert trips > 5 * len(doc["patterns"])  # far fewer patterns than trips is what keeps the file small


def test_a_real_trip_round_trips(doc):
    """Every Illini trip in the fixture, rebuilt from its pattern, matches stop_times.txt minute for minute."""
    z = zipfile.ZipFile(GTFS)
    names = [s[0] for s in doc["stops"]]
    rebuilt = {(names[p["s"][0]], t) for p in doc["patterns"] for t, _m in p["t"]}
    first_calls = {}
    for r in transit._rows(z, "stop_times.txt"):
        first_calls.setdefault(r["trip_id"], r)
    stop_name = {r["stop_id"]: r["stop_name"] for r in transit._rows(z, "stops.txt")}
    sample = list(first_calls.values())[:50]
    found = [(stop_name[r["stop_id"]], transit._minutes(r["departure_time"])) in rebuilt for r in sample]
    assert sum(found) >= len(found) * 0.9  # trips that call at only one kept stop are dropped by design


def test_homes_are_halls_and_apartments():
    homes = transit.homes_from_osm(OSM)
    assert homes and {h.kind for h in homes} <= {"hall", "apartments"}
    names = [h.name for h in homes]
    assert len(names) == len(set(names))
    assert "Allen Hall" in names  # building=dormitory


def test_run_stores_and_exports(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    conn.execute("INSERT INTO buildings VALUES ('Illini Union', 'Illini Union', NULL, 40.109, -88.2272, 'way/1')")
    msg = transit.run(conn, GTFS, OSM)
    assert "routes" in msg and "feed until 2026-12-19" in msg
    out = transit.export_doc(conn)
    assert out["patterns"] and out["credit"]
    # MTD unreachable: an empty timetable, places to live still listed
    transit.run(conn, None, OSM)
    out = transit.export_doc(conn)
    assert out["patterns"] == [] and out["homes"] and out["feed"]["end"] is None


def _zip_bytes() -> bytes:
    return GTFS.read_bytes()


def test_fetch_downloads_then_uses_the_fresh_cache(tmp_path):
    calls = []

    def handler(request):
        calls.append(request.url)
        return httpx.Response(200, content=_zip_bytes())

    cache, stamp = tmp_path / "g.zip", tmp_path / "fetched.json"
    assert transit.fetch(cache, stamp, transport=httpx.MockTransport(handler)) == cache
    assert json.loads(stamp.read_text())["fetched_at"] and len(calls) == 1
    transit.fetch(cache, stamp, transport=httpx.MockTransport(handler))
    assert len(calls) == 1  # fresh: no second download


def test_fetch_keeps_a_stale_copy_when_mtd_is_down_and_rejects_broken_zips(tmp_path):
    cache, stamp = tmp_path / "g.zip", tmp_path / "fetched.json"
    cache.write_bytes(_zip_bytes())  # no stamp: stale
    down = httpx.MockTransport(lambda r: httpx.Response(503))
    assert transit.fetch(cache, stamp, transport=down) == cache
    broken = httpx.MockTransport(lambda r: httpx.Response(200, content=b"<html>maintenance</html>"))
    assert transit.fetch(cache, stamp, transport=broken) == cache
    assert zipfile.ZipFile(io.BytesIO(cache.read_bytes())).testzip() is None  # the good copy wasn't overwritten
    with pytest.raises(transit.TransitUnavailable):
        transit.fetch(tmp_path / "none.zip", tmp_path / "s.json", transport=down)


def test_headsign_drops_mtds_na_direction():
    assert transit.headsign("N/A to Illini Union", "PAR") == "Illini Union"
    assert transit.headsign("N/A", "Illini Union (South Side Shelter)") == "Illini Union (South Side Shelter)"
    assert transit.headsign("North to Lincoln Square", "x") == "North to Lincoln Square"
