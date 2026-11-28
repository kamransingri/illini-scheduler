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


def test_fetch_skips_the_coming_winter_until_wade_mirrors_it(tmp_path, monkeypatch):
    """#269: Wade's mirror has no 2027-wi.csv yet; that 404 isn't fatal, but any other missing file is."""
    import httpx
    import pytest

    from pipeline import fetch

    def fake(rel, max_age, client):
        if rel.endswith(".csv") and "course-catalog" in rel:
            resp = httpx.Response(404, request=httpx.Request("GET", f"https://x/{rel}"))
            raise httpx.HTTPStatusError("404", request=resp.request, response=resp)
        return tmp_path / rel

    monkeypatch.setattr(fetch, "WADE_DIR", tmp_path)
    monkeypatch.setattr(fetch, "_download", fake)
    monkeypatch.setattr(fetch, "record_snapshot_dates", lambda rels: {})
    got = fetch.fetch_wade([fetch.WINTER_TERM])
    assert all("course-catalog" not in str(p) for p in got)
    with pytest.raises(httpx.HTTPStatusError):
        fetch.fetch_wade(["2026-fa"])
