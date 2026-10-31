from pathlib import Path

import pytest

from backend.authlens import service
from backend.authlens.db import connect, init_schema
from backend.authlens.importer import import_csv
from backend.authlens.service import Filters, InvalidInput

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_openssh_sample.csv"
ATTACKER = "203.0.113.5"


@pytest.fixture
def conn(tmp_path):
    connection = connect(tmp_path / "test.db")
    init_schema(connection)
    import_csv(connection, FIXTURE, year=2025)
    yield connection
    connection.close()


# ---- list_events: pagination -------------------------------------------------

def test_pagination_splits_results_in_time_order(conn):
    first = service.list_events(conn, Filters(), page=1, page_size=5)
    last = service.list_events(conn, Filters(), page=3, page_size=5)
    assert (first["total"], first["pages"], len(first["items"])) == (11, 3, 5)
    assert len(last["items"]) == 1
    times = [e["event_time"] for e in first["items"]]
    assert times == sorted(times)


def test_page_past_the_end_is_empty_not_an_error(conn):
    result = service.list_events(conn, Filters(), page=99, page_size=5)
    assert result["items"] == [] and result["total"] == 11


@pytest.mark.parametrize("page, page_size", [(0, 10), (1, 0), (1, service.MAX_PAGE_SIZE + 1)])
def test_bad_paging_is_rejected(conn, page, page_size):
    with pytest.raises(InvalidInput):
        service.list_events(conn, Filters(), page=page, page_size=page_size)


# ---- list_events: filters ----------------------------------------------------

def test_filter_by_ip_and_outcome(conn):
    result = service.list_events(conn, Filters(ip=ATTACKER, outcome="failure"))
    assert result["total"] == 7  # 6 'Failed ...' rows + 1 PAM failure row
    assert {e["source_ip"] for e in result["items"]} == {ATTACKER}


def test_filter_by_username_and_event_type(conn):
    result = service.list_events(conn, Filters(username="root", event_type="auth_failure"))
    assert result["total"] == 5  # four single failures + one "repeated 5 times" row


def test_filter_by_time_range_is_inclusive(conn):
    result = service.list_events(
        conn, Filters(start="2025-12-10T06:56:10", end="2025-12-10T06:56:20")
    )
    assert [e["event_time"] for e in result["items"]] == [
        "2025-12-10T06:56:10", "2025-12-10T06:56:15", "2025-12-10T06:56:20",
    ]


def test_filter_by_ip_only(conn):
    assert service.list_events(conn, Filters(ip=ATTACKER))["total"] == 9


def test_sql_injection_attempt_is_just_a_value(conn):
    evil = "x' OR '1'='1"
    assert service.list_events(conn, Filters(username=evil))["total"] == 0
    assert service.list_events(conn, Filters())["total"] == 11  # table intact


@pytest.mark.parametrize(
    "filters",
    [
        Filters(ip="999.1.1.1"),
        Filters(ip="1.1.1.1; DROP TABLE events"),
        Filters(event_type="made_up"),
        Filters(outcome="maybe"),
        Filters(start="yesterday"),
        Filters(start="2025-12-10T06:00:00+10:00"),
        Filters(start="2025-12-11T00:00:00", end="2025-12-10T00:00:00"),
    ],
)
def test_invalid_filters_are_rejected(conn, filters):
    with pytest.raises(InvalidInput):
        service.list_events(conn, filters)


# ---- summary -----------------------------------------------------------------

def test_summary_headline_numbers(conn):
    s = service.summary(conn)
    assert s["total_events"] == 11
    assert s["failed_attempts"] == 10
    assert s["successful_logins"] == 2
    assert s["unique_source_ips"] == 2
    assert s["failure_rate"] == round(10 / 12, 4)
    assert (s["first_event"], s["last_event"]) == ("2025-12-10T06:55:46", "2025-12-10T07:06:00")


def test_summary_updates_with_filters(conn):
    s = service.summary(conn, Filters(ip="198.51.100.7"))
    assert (s["failed_attempts"], s["successful_logins"], s["failure_rate"]) == (0, 1, 0.0)


def test_summary_with_no_matches_has_no_rate(conn):
    s = service.summary(conn, Filters(ip="192.0.2.1"))
    assert s["total_events"] == 0 and s["failure_rate"] is None


def test_summary_ignores_event_type_filter(conn):
    s = service.summary(conn, Filters(event_type="auth_failure"))
    assert s["successful_logins"] == 2


# ---- timeline ----------------------------------------------------------------

def test_timeline_ten_minute_buckets(conn):
    rows = service.timeline(conn, "ten_minutes")
    assert rows == [
        {"bucket": "2025-12-10T06:50", "events": 7, "failed_attempts": 5, "successful_logins": 0},
        {"bucket": "2025-12-10T07:00", "events": 4, "failed_attempts": 5, "successful_logins": 2},
    ]


def test_timeline_buckets_have_expected_granularity(conn):
    assert all(len(r["bucket"]) == 16 for r in service.timeline(conn, "minute"))
    assert all(len(r["bucket"]) == 13 for r in service.timeline(conn, "hour"))


def test_timeline_rejects_unknown_bucket(conn):
    with pytest.raises(InvalidInput):
        service.timeline(conn, "year; DROP TABLE events")


# ---- ip_profile --------------------------------------------------------------

def test_ip_profile_for_attacker(conn):
    p = service.ip_profile(conn, ATTACKER)
    assert p["total_events"] == 9
    assert (p["failed_attempts"], p["successful_logins"], p["accounts_tried"]) == (10, 1, 2)
    assert (p["first_seen"], p["last_seen"]) == ("2025-12-10T06:56:00", "2025-12-10T07:06:00")
    assert p["targeted_accounts"] == [
        {"username": "root", "failed_attempts": 9},
        {"username": "webmaster", "failed_attempts": 1},
    ]


def test_ip_profile_unknown_ip_is_none(conn):
    assert service.ip_profile(conn, "192.0.2.1") is None


def test_ip_profile_rejects_garbage(conn):
    with pytest.raises(InvalidInput):
        service.ip_profile(conn, "not-an-ip")
