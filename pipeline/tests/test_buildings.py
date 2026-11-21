import json

import httpx
import pandas as pd
import pytest

from pipeline import buildings, db
from pipeline.buildings import OFF, Alias, Locator, addr_key, load_aliases, load_osm, norm
from pipeline.config import FIXTURES

OSM = FIXTURES / "osm" / "campus.json"


@pytest.fixture(scope="module")
def loc() -> Locator:
    places, _ = load_osm(OSM)
    return Locator(places, load_aliases())


def test_norm_and_addresses():
    assert norm("Literatures, Cultures, & Ling") == "literatures cultures and ling"
    assert norm("Inst Labor &  Industrial Rel") == norm("Inst Labor & Industrial Rel")
    assert addr_key("1205", "West Nevada Street") == addr_key("1205", "W Nevada") == "1205 west nevada"
    assert addr_key("1203 1/2", "West Nevada Street") == "1203 1/2 west nevada"


@pytest.mark.parametrize("name, osm_name", [
    # as Course Explorer writes them (2027-sp), matched without a row in data/buildings.csv
    ("Campus Instructional Facility", "Campus Instructional Facility"),
    ("Gregory Hall", "Gregory Hall"),
    ("Krannert Art Museum", "Krannert Art Museum"),       # an OSM point tagged museum, not a building
    ("Carle Foundation Hospital", "Carle Foundation Hospital"),
    # through data/buildings.csv
    ("Electrical & Computer Eng Bldg", "Electrical and Computer Engineering Building"),
    ("Literatures, Cultures, & Ling", "Literatures, Cultures & Linguistics Building"),
    ("Siebel Center for Comp Sci", "Siebel Center for Computer Science"),
    ("Inst Labor &  Industrial Rel", "School of Labor & Employment Relations"),  # double space as the CSV has it
    ("ACES Lib, Info & Alum Ctr", "Funk Library"),
    ("LAB Art-East Annex, Studio 2", "Art Annex Studio 2"),  # a seat page's room word left on the name
    # a street address
    ("1205 W Nevada", None),
])
def test_real_names(loc, name, osm_name):
    hit = loc.locate(name)
    assert isinstance(hit, buildings.Place), name
    if osm_name:
        assert hit.name == osm_name
    assert 40.07 < hit.lat < 40.125 and -88.26 < hit.lon < -88.19


def test_address_names_match_house_number_and_street(loc):
    hit = loc.locate("1205 W Nevada")
    assert isinstance(hit, buildings.Place)
    assert hit.tags["addr:housenumber"] == "1205" and "Nevada" in hit.tags["addr:street"]
    assert loc.locate("1206 W Nevada") is None  # a neighbour's number is not a match


def test_off_campus_and_unknown(loc):
    assert loc.locate("200 S Wacker") == OFF
    assert loc.locate("Washington DC") == OFF
    assert loc.locate("Sch of Info Sciences Bldg") is None  # not in OpenStreetMap: listed, never guessed
    assert loc.locate("Gregory Hal") is None                # no similarity matching


def test_buildings_before_points_when_names_repeat(loc):
    # "Illinois Street Residence Halls" is a way and three entrance points in OSM: the way wins
    hit = loc.locate("Illinois Street Residence Lng")
    assert isinstance(hit, buildings.Place) and hit.osm.startswith("way/")


def test_every_alias_points_at_the_fixture(loc):
    """A typo in data/buildings.csv, or a building renamed in OSM, fails here before it reaches a build."""
    assert loc.broken_aliases() == []


def test_every_building_in_the_fixture_catalog_is_located(loc):
    names = set()
    for term in ("2026-fa", "2027-sp"):
        df = pd.read_csv(FIXTURES / "course-catalog" / f"{term}.csv", dtype=str, keep_default_na=False)
        names |= {b.strip() for b in df["Building"] if b.strip().lower() not in buildings.NO_PLACE}
    assert names and [n for n in sorted(names) if not isinstance(loc.locate(n), buildings.Place)] == []


def test_alias_file_rules(tmp_path):
    p = tmp_path / "b.csv"
    p.write_text("# comment\nname,osm,note\nSouth Farms,-,\n")
    with pytest.raises(ValueError, match="note must say why"):
        load_aliases(p)
    p.write_text("name,osm,note\nA Hall,A,\na hall,B,\n")
    with pytest.raises(ValueError, match="listed twice"):
        load_aliases(p)


def test_run_stores_locations_and_reports_coverage(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    rows = [("2027-sp", "1", 0, "Gregory Hall"), ("2027-sp", "1", 1, "Gregory Hall"),
            ("2027-sp", "2", 0, "Sch of Info Sciences Bldg"), ("2027-sp", "3", 0, "200 S Wacker"),
            ("2027-sp", "4", 0, "Location Pending"), ("2026-fa", "5", 0, "Siebel Center for Comp Sci")]
    conn.executemany("INSERT INTO meetings (term, crn, idx, building) VALUES (?,?,?,?)", rows)
    rep = buildings.run(conn, OSM, "2027-sp")
    # next term: Gregory (2 meetings) located, the iSchool (1) not; Chicago and "Location Pending" don't count
    assert (rep.next_located, rep.next_total) == (2, 3) and rep.share == pytest.approx(2 / 3)
    assert rep.located == 2 and rep.off == 1 and dict(rep.missing) == {"Sch of Info Sciences Bldg": 1}
    out = buildings.export_rows(conn)
    assert set(out) == {"Gregory Hall", "Siebel Center for Comp Sci"}
    assert out["Siebel Center for Comp Sci"]["name"] == "Siebel Center for Computer Science"
    assert "Sch of Info Sciences Bldg" in str(rep)


def _overpass(*answers):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        code, body = answers[len(calls) - 1]
        return httpx.Response(code, json=body)

    return httpx.MockTransport(handler), calls


def test_fetch_tries_the_next_server_and_caches(tmp_path):
    doc = json.loads(OSM.read_text())
    transport, calls = _overpass((502, {}), (200, doc))
    cache = tmp_path / "osm" / "campus.json"
    assert buildings.fetch(cache, transport=transport) == cache
    assert len(calls) == 2 and calls[1].startswith(buildings.OVERPASS[1])
    saved = json.loads(cache.read_text())
    assert saved["elements"] == doc["elements"] and saved["fetched_at"]
    transport, calls = _overpass()
    buildings.fetch(cache, transport=transport)  # fresh: no request
    assert calls == []


def test_a_cache_without_its_fetch_time_is_stale_whatever_its_file_date(tmp_path):
    # a CI cache restore gives the file today's date; only the fetched_at inside counts
    cache = tmp_path / "campus.json"
    cache.write_text(OSM.read_text())  # the fixture has no fetched_at
    doc = json.loads(OSM.read_text())
    transport, calls = _overpass((200, doc))
    buildings.fetch(cache, transport=transport)
    assert len(calls) == 1


def test_fetch_falls_back_to_a_stale_cache_then_gives_up(tmp_path):
    cache = tmp_path / "campus.json"
    cache.write_text(OSM.read_text())
    transport, _ = _overpass((502, {}), (200, {"elements": []}))
    assert buildings.fetch(cache, max_age_days=0, transport=transport) == cache
    transport, _ = _overpass((502, {}), (502, {}))
    with pytest.raises(buildings.BuildingsUnavailable):
        buildings.fetch(tmp_path / "none.json", transport=transport)


def test_alias_dataclass_is_what_load_aliases_returns():
    a = load_aliases()["200 S Wacker"]
    assert a == Alias("200 S Wacker", OFF, a.note) and "Chicago" in a.note
