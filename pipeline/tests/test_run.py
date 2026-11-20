from pipeline import config, db, export, run


def test_export_only_reuses_the_database_and_fetches_nothing(tmp_path, monkeypatch):
    """`--export-only` (CI's pull request check, #148): export from the database that's there, or stop if none."""
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "illini.db")
    monkeypatch.setattr(config, "WEB_DATA", tmp_path / "out")
    monkeypatch.setattr(run, "fetch_wade", lambda *a: (_ for _ in ()).throw(AssertionError("fetched")))
    assert run.main(["--export-only"]) == 1  # no database yet

    db.connect(config.DB_PATH).close()
    seen = {}

    def fake_export(conn, out_dir, rename=None):
        seen.update(out=out_dir, rename=rename)
        return "ok"

    monkeypatch.setattr(export, "run", fake_export)
    assert run.main(["--export-only"]) == 0
    assert seen["out"] == tmp_path / "out" and seen["rename"] is not None
