"""Analysis queries over the events table.

Counting rules (see README "Known limitations / TODO"):
  * "Failed login attempts" are rows with event_type = 'auth_failure', i.e. the
    sshd "Failed password ..." lines. PAM lines (pam_auth_failure) often describe
    the same attempt, so they are NOT included in attempt counts.
  * Counts sum repeat_count, so "message repeated N times" lines are not undercounted.
  * All queries are parameterised; no user input is ever formatted into SQL.
"""
from __future__ import annotations

import sqlite3

_TS_FORMAT = "%Y-%m-%dT%H:%M:%S"  # matches how event_time is stored


def event_counts(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Number of stored rows and total occurrences per event type."""
    return conn.execute(
        """
        SELECT event_type,
               COUNT(*)          AS rows,
               SUM(repeat_count) AS occurrences
        FROM events
        GROUP BY event_type
        ORDER BY occurrences DESC
        """
    ).fetchall()


def top_failing_ips(conn: sqlite3.Connection, limit: int = 10) -> list[sqlite3.Row]:
    """Source IPs ranked by failed login attempts, with how many accounts they tried."""
    return conn.execute(
        """
        SELECT source_ip,
               SUM(repeat_count)        AS failed_attempts,
               COUNT(DISTINCT username) AS accounts_tried,
               MIN(event_time)          AS first_seen,
               MAX(event_time)          AS last_seen
        FROM events
        WHERE event_type = 'auth_failure' AND source_ip IS NOT NULL
        GROUP BY source_ip
        ORDER BY failed_attempts DESC, source_ip
        LIMIT ?
        """,
        (limit,),
    ).fetchall()


def top_targeted_accounts(conn: sqlite3.Connection, limit: int = 10) -> list[sqlite3.Row]:
    """Usernames ranked by failed login attempts against them."""
    return conn.execute(
        """
        SELECT username,
               SUM(repeat_count)           AS failed_attempts,
               COUNT(DISTINCT source_ip)   AS distinct_ips,
               MAX(invalid_user)           AS is_invalid_user
        FROM events
        WHERE event_type = 'auth_failure' AND username IS NOT NULL
        GROUP BY username
        ORDER BY failed_attempts DESC, username
        LIMIT ?
        """,
        (limit,),
    ).fetchall()


def repeated_failures(
    conn: sqlite3.Connection, threshold: int = 5, window_minutes: int = 5
) -> list[sqlite3.Row]:
    """Rule: at least `threshold` failed attempts from one IP within `window_minutes`.

    A window function counts, for every failure, the attempts from the same IP in the
    preceding window (including itself). Rows reaching the threshold are summarised
    per IP: when the rule first fired and the worst burst seen.
    """
    return conn.execute(
        """
        WITH windowed AS (
            SELECT source_ip,
                   event_time,
                   SUM(repeat_count) OVER (
                       PARTITION BY source_ip
                       ORDER BY CAST(strftime('%s', event_time) AS INTEGER)
                       RANGE BETWEEN ? PRECEDING AND CURRENT ROW
                   ) AS attempts_in_window
            FROM events
            WHERE event_type = 'auth_failure' AND source_ip IS NOT NULL
        )
        SELECT source_ip,
               MIN(event_time)         AS first_triggered_at,
               MAX(attempts_in_window) AS peak_attempts_in_window
        FROM windowed
        WHERE attempts_in_window >= ?
        GROUP BY source_ip
        ORDER BY peak_attempts_in_window DESC, source_ip
        """,
        (window_minutes * 60, threshold),
    ).fetchall()


def success_after_failures(
    conn: sqlite3.Connection, min_failures: int = 5, window_minutes: int = 10
) -> list[sqlite3.Row]:
    """Rule: a successful login from an IP that failed >= `min_failures` times shortly before."""
    return conn.execute(
        """
        WITH successes AS (
            SELECT id, event_time, source_ip, username
            FROM events
            WHERE event_type = 'auth_success' AND source_ip IS NOT NULL
        )
        SELECT s.event_time AS success_time,
               s.source_ip,
               s.username,
               SUM(f.repeat_count) AS failures_before
        FROM successes s
        JOIN events f
          ON f.source_ip = s.source_ip
         AND f.event_type = 'auth_failure'
         AND f.event_time <  s.event_time
         AND f.event_time >= strftime(?, s.event_time, ?)
        GROUP BY s.id
        HAVING failures_before >= ?
        ORDER BY s.event_time
        """,
        (_TS_FORMAT, f"-{window_minutes} minutes", min_failures),
    ).fetchall()
