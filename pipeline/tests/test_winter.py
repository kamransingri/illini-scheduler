import json

from pipeline import db, winter

from .test_summer import section


def test_the_newest_winter_lists_its_classes(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    for t in ("2024-wi", "2025-wi", "2026-wi"):
        section(conn, t, f"1{t[:4]}", "BADM", "275", pot="1")
    section(conn, "2026-wi", "2", "ECON", "102", typ="LEC", pot="1")
    section(conn, "2026-wi", "3", "BADM", "395", typ="INT", pot="1")  # an internship isn't a class
    section(conn, "2026-fa", "4", "BADM", "275", typ="LEC", pot="1")
    data = winter.build(conn, ("2026-fa", "2027-sp"))
    assert data is not None
    assert (data["term"], data["label"], data["next"], data["next_label"]) == \
        ("2026-wi", "Winter 2026", "2027-wi", "Winter 2027")
    assert not data["upcoming"] and data["recent"] == ["2024-wi", "2025-wi", "2026-wi"]
    assert data["courses"] == [{"s": "BADM", "n": "275", "nSec": 1, "online": "all", "ran": 3},
                               {"s": "ECON", "n": "102", "nSec": 1, "online": "none", "ran": 1}]
    assert winter.export(conn, tmp_path, ("2026-fa", "2027-sp")) == "2 Winter 2026 classes"
    assert json.loads((tmp_path / "winter.json").read_text(encoding="utf-8"))["term"] == "2026-wi"


def test_next_winter_is_ahead_while_fall_is_current(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    section(conn, "2027-wi", "1", "BADM", "275", pot="1")
    data = winter.build(conn, ("2026-fa", "2027-sp"))
    assert data is not None and data["upcoming"] and data["label"] == "Winter 2027"


def test_no_winter_loaded(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    assert winter.build(conn) is None
    assert winter.export(conn, tmp_path) == "no winter term loaded"
