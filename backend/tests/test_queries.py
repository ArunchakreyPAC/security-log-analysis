from pathlib import Path

import pytest

from backend.authlens import queries
from backend.authlens.db import connect, init_schema
from backend.authlens.importer import import_csv

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_openssh_sample.csv"
ATTACKER = "203.0.113.5"


@pytest.fixture
def conn(tmp_path):
    connection = connect(tmp_path / "test.db")
    init_schema(connection)
    import_csv(connection, FIXTURE, year=2025)
    yield connection
    connection.close()


def test_event_counts_sum_repeat_count(conn):
    counts = {r["event_type"]: r["occurrences"] for r in queries.event_counts(conn)}
    # 5 single failures + one "repeated 5 times" line = 10 occurrences
    assert counts["auth_failure"] == 10
    assert counts["auth_success"] == 2


def test_top_failing_ips_excludes_pam_rows(conn):
    rows = queries.top_failing_ips(conn)
    assert [r["source_ip"] for r in rows] == [ATTACKER]
    assert rows[0]["failed_attempts"] == 10          # PAM line not counted
    assert rows[0]["accounts_tried"] == 2            # root and webmaster


def test_top_targeted_accounts(conn):
    rows = {r["username"]: r for r in queries.top_targeted_accounts(conn)}
    assert rows["root"]["failed_attempts"] == 9
    assert rows["webmaster"]["failed_attempts"] == 1
    assert rows["webmaster"]["is_invalid_user"] == 1


def test_repeated_failures_fires_on_burst(conn):
    rows = queries.repeated_failures(conn, threshold=5, window_minutes=5)
    assert len(rows) == 1
    assert rows[0]["source_ip"] == ATTACKER
    assert rows[0]["first_triggered_at"] == "2025-12-10T06:56:25"
    assert rows[0]["peak_attempts_in_window"] == 5


def test_repeated_failures_respects_threshold(conn):
    assert queries.repeated_failures(conn, threshold=6, window_minutes=5) == []


def test_repeated_failures_window_matters(conn):
    # A zero-length window only groups rows with identical timestamps, so the 5-failure
    # burst spread over ~23s cannot fire. Only the single "repeated 5 times" line does.
    rows = queries.repeated_failures(conn, threshold=5, window_minutes=0)
    assert all(r["peak_attempts_in_window"] >= 5 for r in rows)
    assert [r["first_triggered_at"] for r in rows] == ["2025-12-10T07:06:00"]


def test_success_after_failures_flags_attacker_only(conn):
    rows = queries.success_after_failures(conn, min_failures=5, window_minutes=10)
    assert len(rows) == 1
    assert rows[0]["source_ip"] == ATTACKER
    assert rows[0]["username"] == "root"
    assert rows[0]["failures_before"] == 5


def test_success_after_failures_ignores_old_failures(conn):
    # Failures were ~6 minutes before the success; a 3 minute window misses them.
    assert queries.success_after_failures(conn, min_failures=5, window_minutes=3) == []
