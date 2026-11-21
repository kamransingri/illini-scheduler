# Test fixtures

Everything here is real data saved from its source, never written by hand. The tests read these files instead of
the network.

| Folder | What | Saved | Made by |
| --- | --- | --- | --- |
| `course-explorer/` | Course Explorer API XML: the Spring 2027 schedule index, and CS 124, STAT 107, RHET 105 (Spring 2027) and MATH 221 (Fall 2026, it's fall only) with `mode=cascade` | 2026-11-17 | `python -m pipeline.fetch_fixtures` |
| `rmp/` | Rate My Professors answers as RMP sent them: the school search, and the teacher searches for "Challen" and "Lewis" | 2026-11-17 | `python -m pipeline.fetch_fixtures` |
| `course-catalog/`, `gpa/` | Slices of Wade Fagen-Ulmschneider's datasets for the reference courses | 2026-11-04 | `python -m pipeline.make_fixtures` |
| `osm/campus.json` | OpenStreetMap buildings and places the section data's building names match, with only the tags the locator reads | 2026-11-21 | `python -m pipeline.buildings --save-fixture` |
| `course-explorer-web/` | Course Explorer web pages (sections, seat status, final exams) | 2026-11-16 | saved by hand from the site |
| `catalog/` | Academic catalog program pages for the importer tests | 2026-11-17 | saved by hand from the catalog |
| `bundle-parity.json` | Section bundles both test suites must agree on | 2026-11-16, cases added 2026-11-17 | `pipeline/tests` |

`course-explorer/` and `rmp/` can be refreshed with the "Fetch data" workflow (or the command above). Then update
the date here. The Course Explorer test compares the XML with the older CSV slice, so it allows an instructor or room
the CSV didn't have yet.
