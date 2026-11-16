import pytest

from pipeline import db


@pytest.fixture(autouse=True)
def _close_databases(monkeypatch):
    """Close every SQLite connection a test opens through db.connect, so Python 3.13's ResourceWarning for unclosed
    databases never fires at a random later test."""
    opened = []
    real = db.connect

    def tracking(*args, **kwargs):
        conn = real(*args, **kwargs)
        opened.append(conn)
        return conn

    monkeypatch.setattr(db, "connect", tracking)
    yield
    for conn in opened:
        conn.close()
