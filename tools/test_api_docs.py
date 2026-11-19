import json
import re

import pytest

from tools import api_docs as a

DOC = """
### `data/meta.json`
| Field | Type | Meaning |
| --- | --- | --- |
| `built_at` | string | |
| `terms.<term>.label` | string | |

### `data/course/<SUBJECT>/<NUMBER>.json`
| `title` | string | |
| `credit_range` | [number, number] | |
| `gpa.avg` | number | |
| `terms.<term>.sections[].crn` | string | |
| `terms.<term>.sections[].meetings[].d` | number | |

### `data/crns.json`
| `<term>.<crn>` | array | |

### `data/geneds.json`
| `[].s` | string | |

## Not a file
| `stray` | string | |
"""


def test_parse_reads_each_files_table():
    docs = a.parse(DOC)
    assert set(docs) == {"meta.json", "course/<SUBJECT>/<NUMBER>.json", "crns.json", "geneds.json"}


def test_documented_fields_pass_and_map_keys_match_any_key():
    docs = a.parse(DOC)
    course = {"title": "Intro", "credit_range": [3, 4], "gpa": None,
              "terms": {"2027-sp": {"sections": [{"crn": "1", "meetings": [{"d": 10}]}]}, "2026-fa": {"sections": []}}}
    assert a.undocumented(course, docs["course/<SUBJECT>/<NUMBER>.json"]) == set()
    assert a.undocumented({"2027-sp": {"12345": ["CS", "124", "AL1", "Lecture"]}}, docs["crns.json"]) == set()
    assert a.undocumented([{"s": "CS"}], docs["geneds.json"]) == set()


def test_new_fields_are_reported_where_they_are():
    docs = a.parse(DOC)
    course = {"title": "Intro", "new": 1, "gpa": {"avg": 3.1, "median": 3.3},
              "terms": {"2027-sp": {"label": "x",
                                    "sections": [{"crn": "1", "fx": [], "meetings": [{"d": 1, "b": "DCL"}]}]}}}
    assert a.undocumented(course, docs["course/<SUBJECT>/<NUMBER>.json"]) == {
        "new", "gpa.median", "terms.2027-sp.label", "terms.2027-sp.sections[].fx",
        "terms.2027-sp.sections[].meetings[].b"}
    # a list of objects needs its items documented; a list of plain values doesn't
    assert a.undocumented({"built_at": [{"x": 1}]}, docs["meta.json"]) == {"built_at[]"}
    assert a.undocumented([{"s": "CS", "t": "Intro"}], docs["geneds.json"]) == {"[].t"}


def test_files_match_exact_names_before_patterns():
    pats = ["degrees/index.json", "degrees/<id>.json", "course/<SUBJECT>/<NUMBER>.json", "meta.json"]
    assert a.pattern_for("degrees/index.json", pats) == "degrees/index.json"
    assert a.pattern_for("degrees/cs-bs.json", pats) == "degrees/<id>.json"
    assert a.pattern_for("course/CS/124.json", pats) == "course/<SUBJECT>/<NUMBER>.json"
    assert a.pattern_for("course/CS/extra/124.json", pats) is None
    assert a.pattern_for("new.json", pats) is None


def test_check_dir_reports_new_files_and_fields(tmp_path):
    (tmp_path / "course" / "CS").mkdir(parents=True)
    (tmp_path / "meta.json").write_text(json.dumps({"built_at": "x", "terms": {"2027-sp": {"label": "y"}}}))
    (tmp_path / "course" / "CS" / "124.json").write_text(json.dumps({"title": "Intro", "renamed": 1}))
    (tmp_path / "new.json").write_text("{}")
    assert a.check_dir(tmp_path, DOC) == [
        "course/<SUBJECT>/<NUMBER>.json: renamed", "new.json: (the file has no section in docs/API.md)"]
    assert a.check("crns.json", {"2027-sp": {}}, DOC) == set()
    assert a.check("live.json", {}, DOC) == {"(no section in docs/API.md)"}


def test_api_md_rows_parse():
    """Every table row under a file heading is a path the checker can read: no stray spaces or dots."""
    for name, node in a.parse(a.API_MD.read_text(encoding="utf-8")).items():
        assert node.children or node.wild or not name.endswith(".json"), f"{name} has no fields"
    for line in a.API_MD.read_text(encoding="utf-8").splitlines():
        if m := a.ROW.match(line):
            assert not re.search(r"\.\.|^\.|\.$|\[\]\[", m.group(1)), line


@pytest.mark.skipif(not (a.DATA_DIR / "meta.json").exists(), reason="no web/public/data: run `make data`")
def test_site_data_is_documented():
    """The full export (the nightly build runs `make data` before the tests). The fixture export is checked in CI by
    pipeline/tests/test_export.py."""
    assert a.check_dir(a.DATA_DIR) == []


def test_llms_txt_links_to_documented_files():
    text = (a.ROOT / "web" / "public" / "llms.txt").read_text(encoding="utf-8")
    assert text.startswith("# Illini Scheduler\n\n> ")
    docs = list(a.parse(a.API_MD.read_text(encoding="utf-8")))
    files = re.findall(r"\]\(https://kamransingri\.github\.io/illini-scheduler/data/([^)]+)\)", text)
    assert "meta.json" in files and len(files) >= 8
    for f in files:
        assert a.pattern_for(f, docs), f"llms.txt links to {f}, which docs/API.md doesn't describe"
    for doc in re.findall(r"/main/(docs/[A-Z-]+\.md)\)", text):
        assert (a.ROOT / doc).exists(), doc
