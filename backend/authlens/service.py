"""Query layer used by the API: validated filters, pagination, summary, timeline, IP profile.

Everything here is plain Python + sqlite3 so it can be tested without a web framework.

Safety rules:
  * User-supplied values are ALWAYS passed as SQL parameters, never formatted into SQL.
  * The only f-string SQL below interpolates fragments chosen from fixed dictionaries
    in this file (column conditions, timeline buckets), never request data.
  * Inputs are validated up front and rejected with InvalidInput (the API maps it to HTTP 422).
"""
from __future__ import annotations

import ipaddress
import sqlite3
from dataclasses import dataclass, replace
from datetime import datetime

EVENT_TYPES = ("auth_failure", "auth_success", "invalid_user", "pam_auth_failure", "other")
OUTCOMES = ("success", "failure")
MAX_PAGE_SIZE = 200
_TS_FORMAT = "%Y-%m-%dT%H:%M:%S"  # how event_time is stored (no timezone, see README)

# Timeline buckets are string slices of the ISO timestamp: 'YYYY-MM-DDTHH:MM:SS'.
_BUCKETS = {
    "minute": "substr(event_time, 1, 16)",
    "ten_minutes": "substr(event_time, 1, 15) || '0'",
    "hour": "substr(event_time, 1, 13)",
}

_EVENT_COLUMNS = (
    "id, event_time, host, event_type, outcome, username, source_ip, source_port, "
    "auth_method, invalid_user, repeat_count, raw_message"
)


class InvalidInput(ValueError):
    """A request value failed validation."""


@dataclass(frozen=True)
class Filters:
    ip: str | None = None
    username: str | None = None
    host: str | None = None
    event_type: str | None = None
    outcome: str | None = None
    start: str | None = None  # inclusive, ISO timestamp
    end: str | None = None    # inclusive, ISO timestamp


def _parse_time(value: str, name: str) -> str:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise InvalidInput(
            f"{name} must be an ISO timestamp like 2025-12-10T09:30:00"
        ) from None
    if parsed.tzinfo is not None:
        raise InvalidInput(
            f"{name} must not include a timezone offset; stored times have no timezone"
        )
    return parsed.strftime(_TS_FORMAT)


def validate_ip(value: str) -> str:
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        raise InvalidInput(f"{value!r} is not a valid IP address") from None


def validate_filters(filters: Filters) -> Filters:
    """Return a normalised copy of the filters, or raise InvalidInput."""
    ip = validate_ip(filters.ip) if filters.ip is not None else None
    if filters.event_type is not None and filters.event_type not in EVENT_TYPES:
        raise InvalidInput(f"event_type must be one of {', '.join(EVENT_TYPES)}")
    if filters.outcome is not None and filters.outcome not in OUTCOMES:
        raise InvalidInput(f"outcome must be one of {', '.join(OUTCOMES)}")
    start = _parse_time(filters.start, "start") if filters.start is not None else None
    end = _parse_time(filters.end, "end") if filters.end is not None else None
    if start and end and start > end:
        raise InvalidInput("start must not be after end")
    return replace(filters, ip=ip, start=start, end=end)


# Fixed SQL fragment per filter field. Values are bound as parameters.
_CONDITIONS = (
    ("ip", "source_ip = ?"),
    ("username", "username = ?"),
    ("host", "host = ?"),
    ("event_type", "event_type = ?"),
    ("outcome", "outcome = ?"),
    ("start", "event_time >= ?"),
    ("end", "event_time <= ?"),
)


def _where(filters: Filters) -> tuple[str, list]:
    clauses: list[str] = []
    params: list = []
    for field, fragment in _CONDITIONS:
        value = getattr(filters, field)
        if value is not None:
            clauses.append(fragment)
            params.append(value)
    return ("WHERE " + " AND ".join(clauses)) if clauses else "", params


def list_events(
    conn: sqlite3.Connection, filters: Filters, page: int = 1, page_size: int = 50
) -> dict:
    """One page of events matching the filters, oldest first."""
    if page < 1:
        raise InvalidInput("page must be 1 or greater")
    if not 1 <= page_size <= MAX_PAGE_SIZE:
        raise InvalidInput(f"page_size must be between 1 and {MAX_PAGE_SIZE}")
    filters = validate_filters(filters)
    where, params = _where(filters)

    total = conn.execute(f"SELECT COUNT(*) FROM events {where}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT {_EVENT_COLUMNS} FROM events {where} "
        "ORDER BY event_time, id LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": -(-total // page_size),  # ceiling division
    }


def _summary_filters(filters: Filters) -> Filters:
    # Summary and timeline always cover every event type, so type/outcome filters are dropped.
    return replace(validate_filters(filters), event_type=None, outcome=None)


def summary(conn: sqlite3.Connection, filters: Filters | None = None) -> dict:
    """Headline numbers. Failed attempts = 'Failed ...' lines, summing repeat_count."""
    where, params = _where(_summary_filters(filters or Filters()))
    row = conn.execute(
        f"""
        SELECT COUNT(*) AS total_events,
               COALESCE(SUM(CASE WHEN event_type = 'auth_failure' THEN repeat_count END), 0)
                   AS failed_attempts,
               COALESCE(SUM(CASE WHEN event_type = 'auth_success' THEN repeat_count END), 0)
                   AS successful_logins,
               COUNT(DISTINCT source_ip) AS unique_source_ips,
               MIN(event_time) AS first_event,
               MAX(event_time) AS last_event
        FROM events {where}
        """,
        params,
    ).fetchone()
    result = dict(row)
    attempts = result["failed_attempts"] + result["successful_logins"]
    result["failure_rate"] = (
        round(result["failed_attempts"] / attempts, 4) if attempts else None
    )
    return result


def timeline(
    conn: sqlite3.Connection, bucket: str = "ten_minutes", filters: Filters | None = None
) -> list[dict]:
    """Failed attempts, successful logins and event counts per time bucket."""
    if bucket not in _BUCKETS:
        raise InvalidInput(f"bucket must be one of {', '.join(_BUCKETS)}")
    where, params = _where(_summary_filters(filters or Filters()))
    rows = conn.execute(
        f"""
        SELECT {_BUCKETS[bucket]} AS bucket,
               COUNT(*) AS events,
               COALESCE(SUM(CASE WHEN event_type = 'auth_failure' THEN repeat_count END), 0)
                   AS failed_attempts,
               COALESCE(SUM(CASE WHEN event_type = 'auth_success' THEN repeat_count END), 0)
                   AS successful_logins
        FROM events {where}
        GROUP BY bucket
        ORDER BY bucket
        """,
        params,
    ).fetchall()
    return [dict(r) for r in rows]


def ip_profile(conn: sqlite3.Connection, ip: str) -> dict | None:
    """Overview of one source IP for the investigation view, or None if never seen."""
    ip = validate_ip(ip)
    row = conn.execute(
        """
        SELECT COUNT(*) AS total_events,
               COALESCE(SUM(CASE WHEN event_type = 'auth_failure' THEN repeat_count END), 0)
                   AS failed_attempts,
               COALESCE(SUM(CASE WHEN event_type = 'auth_success' THEN repeat_count END), 0)
                   AS successful_logins,
               COUNT(DISTINCT username) AS accounts_tried,
               MIN(event_time) AS first_seen,
               MAX(event_time) AS last_seen
        FROM events WHERE source_ip = ?
        """,
        (ip,),
    ).fetchone()
    if row["total_events"] == 0:
        return None
    targeted = conn.execute(
        """
        SELECT username, SUM(repeat_count) AS failed_attempts
        FROM events
        WHERE source_ip = ? AND event_type = 'auth_failure' AND username IS NOT NULL
        GROUP BY username
        ORDER BY failed_attempts DESC, username
        LIMIT 20
        """,
        (ip,),
    ).fetchall()
    return {"ip": ip, **dict(row), "targeted_accounts": [dict(r) for r in targeted]}
