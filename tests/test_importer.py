from pathlib import Path

import pytest

from authlens.db import connect, init_schema
from authlens.importer import SchemaError, import_csv

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_openssh_sample.csv"


@pytest.fixture
def conn(tmp_path):
    connection = connect(tmp_path / "test.db")
    init_schema(connection)
    yield connection
    connection.close()


def test_report_counts(conn):
    report = import_csv(conn, FIXTURE, year=2025)
    assert report.total_rows == 13
    assert report.imported == 11
    assert report.duplicates == 0
    assert report.rejected == 2
    assert dict(report.reject_reasons) == {"invalid timestamp": 1, "empty message": 1}


def test_rejected_rows_are_stored_with_reason(conn):
    import_csv(conn, FIXTURE, year=2025)
    reasons = {r["reason"] for r in conn.execute("SELECT reason FROM import_rejects")}
    assert reasons == {"invalid timestamp", "empty message"}


def test_import_is_idempotent(conn):
    import_csv(conn, FIXTURE, year=2025)
    second = import_csv(conn, FIXTURE, year=2025)
    assert second.imported == 0
    assert second.duplicates == 11
    assert conn.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 11


def test_event_types_are_classified(conn):
    import_csv(conn, FIXTURE, year=2025)
    counts = {
        r["event_type"]: r["n"]
        for r in conn.execute("SELECT event_type, COUNT(*) AS n FROM events GROUP BY 1")
    }
    assert counts == {
        "other": 1, "invalid_user": 1, "auth_failure": 6,
        "auth_success": 2, "pam_auth_failure": 1,
    }


def test_raw_message_and_source_are_preserved(conn):
    import_csv(conn, FIXTURE, year=2025)
    row = conn.execute("SELECT * FROM events WHERE source_line = 9").fetchone()
    assert row["raw_message"].startswith("Accepted password for root")
    assert row["source_file"] == FIXTURE.name
    assert row["event_time"] == "2025-12-10T07:02:30"


def test_success_after_failures_is_queryable(conn):
    """The synthetic data contains a success from an IP that failed repeatedly."""
    import_csv(conn, FIXTURE, year=2025)
    row = conn.execute(
        """
        SELECT s.source_ip, s.event_time AS success_time,
               (SELECT COUNT(*) FROM events f
                 WHERE f.source_ip = s.source_ip AND f.outcome = 'failure'
                   AND f.event_time < s.event_time) AS prior_failures
        FROM events s
        WHERE s.outcome = 'success' AND s.source_ip = ?
        """,
        ("203.0.113.5",),
    ).fetchone()
    assert row["prior_failures"] == 5


def test_year_rolls_over_when_log_crosses_new_year(conn, tmp_path):
    csv_path = tmp_path / "rollover.csv"
    csv_path.write_text(
        "LineId,Date,Day,Time,Component,Pid,Content\n"
        "1,Dec,31,23:59:58,sshd,1,Failed password for root from 203.0.113.5 port 1 ssh2\n"
        "2,Jan,1,00:00:03,sshd,1,Failed password for root from 203.0.113.5 port 2 ssh2\n",
        encoding="utf-8",
    )
    import_csv(conn, csv_path, year=2025)
    times = [r["event_time"] for r in conn.execute("SELECT event_time FROM events ORDER BY id")]
    assert times == ["2025-12-31T23:59:58", "2026-01-01T00:00:03"]


def test_missing_columns_raise_clear_error(conn, tmp_path):
    csv_path = tmp_path / "wrong.csv"
    csv_path.write_text("timestamp,message\n2025-12-10,hello\n", encoding="utf-8")
    with pytest.raises(SchemaError) as error:
        import_csv(conn, csv_path, year=2025)
    assert "Columns found" in str(error.value)
