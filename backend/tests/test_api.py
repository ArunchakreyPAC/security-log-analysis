import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from pathlib import Path  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from backend.authlens.api import app  # noqa: E402
from backend.authlens.db import connect, init_schema  # noqa: E402
from backend.authlens.importer import import_csv  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_openssh_sample.csv"
ATTACKER = "203.0.113.5"


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "api test's.db"  # spaces and an apostrophe, like a real Windows path
    conn = connect(db_path)
    init_schema(conn)
    import_csv(conn, FIXTURE, year=2025)
    conn.close()
    monkeypatch.setenv("AUTHLENS_DB", str(db_path))
    return TestClient(app)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_summary(client):
    body = client.get("/summary").json()
    assert body["total_events"] == 11
    assert body["failed_attempts"] == 10


def test_summary_filtered_by_ip(client):
    body = client.get("/summary", params={"ip": "198.51.100.7"}).json()
    assert (body["failed_attempts"], body["successful_logins"]) == (0, 1)


def test_events_pagination(client):
    body = client.get("/events", params={"page": 2, "page_size": 5}).json()
    assert body["total"] == 11 and body["pages"] == 3 and len(body["items"]) == 5


def test_events_filters_combine(client):
    body = client.get(
        "/events", params={"ip": ATTACKER, "event_type": "auth_failure", "username": "root"}
    ).json()
    assert body["total"] == 5


def test_events_rejects_oversized_page(client):
    assert client.get("/events", params={"page_size": 1000}).status_code == 422


@pytest.mark.parametrize(
    "params",
    [{"ip": "nope"}, {"event_type": "bogus"}, {"outcome": "maybe"}, {"start": "yesterday"}],
)
def test_events_rejects_bad_filters(client, params):
    response = client.get("/events", params=params)
    assert response.status_code == 422
    assert "detail" in response.json()


def test_injection_attempt_is_harmless(client):
    body = client.get("/events", params={"username": "x' OR '1'='1"}).json()
    assert body["total"] == 0
    assert client.get("/summary").json()["total_events"] == 11


def test_timeline(client):
    rows = client.get("/timeline", params={"bucket": "ten_minutes"}).json()
    assert [r["bucket"] for r in rows] == ["2025-12-10T06:50", "2025-12-10T07:00"]
    assert client.get("/timeline", params={"bucket": "decade"}).status_code == 422


def test_top_lists(client):
    assert client.get("/top/ips").json()[0]["source_ip"] == ATTACKER
    assert client.get("/top/accounts").json()[0]["username"] == "root"
    assert client.get("/top/ips", params={"limit": 0}).status_code == 422


def test_repeated_failures_alert_explains_itself(client):
    body = client.get("/alerts/repeated-failures").json()
    assert "5 failed attempts" in body["rule"]
    assert [a["source_ip"] for a in body["alerts"]] == [ATTACKER]


def test_success_after_failures_alert(client):
    body = client.get("/alerts/success-after-failures").json()
    assert len(body["alerts"]) == 1
    assert body["alerts"][0]["username"] == "root"


def test_ip_profile_and_errors(client):
    assert client.get(f"/ips/{ATTACKER}").json()["failed_attempts"] == 10
    assert client.get("/ips/192.0.2.1").status_code == 404
    assert client.get("/ips/not-an-ip").status_code == 422


def test_missing_database_gives_503(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTHLENS_DB", str(tmp_path / "missing.db"))
    assert TestClient(app).get("/summary").status_code == 503


def test_database_without_tables_gives_503(tmp_path, monkeypatch):
    empty = tmp_path / "empty.db"
    connect(empty).close()
    monkeypatch.setenv("AUTHLENS_DB", str(empty))
    assert TestClient(app).get("/summary").status_code == 503
