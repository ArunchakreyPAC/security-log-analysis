"""Import a Loghub-style structured OpenSSH CSV into SQLite.

Usage:
    python -m authlens.importer --csv sample-data/OpenSSH_2k.log_structured.csv \
        --db authlens.db --year 2025

The import is idempotent: events are keyed on (source file, source line), so
running it twice reports every row as a duplicate and inserts nothing.
"""
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .db import connect, init_schema
from .parser import MONTHS, build_timestamp, parse_message

REQUIRED_COLUMNS = ("Date", "Day", "Time", "Content")

# A month jump this large going forward through the file means the log crossed
# a new year (Dec -> Jan is 11). Small backwards jumps are just disorder.
_YEAR_ROLLOVER_GAP = 6


class SchemaError(Exception):
    """The CSV does not have the columns this importer expects."""


@dataclass
class ImportReport:
    total_rows: int = 0
    imported: int = 0
    duplicates: int = 0
    rejected: int = 0
    reject_reasons: Counter = field(default_factory=Counter)

    def summary(self) -> str:
        lines = [
            f"Rows read:   {self.total_rows}",
            f"Imported:    {self.imported}",
            f"Duplicates:  {self.duplicates}",
            f"Rejected:    {self.rejected}",
        ]
        for reason, count in self.reject_reasons.most_common():
            lines.append(f"  - {reason}: {count}")
        return "\n".join(lines)


def _check_columns(fieldnames: list[str] | None) -> None:
    found = fieldnames or []
    missing = [c for c in REQUIRED_COLUMNS if c not in found]
    if missing:
        raise SchemaError(
            f"CSV is missing required column(s) {missing}. "
            f"Columns found: {found}"
        )


def import_csv(conn: sqlite3.Connection, csv_path: str | Path, year: int) -> ImportReport:
    """Import one CSV file and return a report of what happened to each row."""
    csv_path = Path(csv_path)
    source_file = csv_path.name
    report = ImportReport()

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        _check_columns(reader.fieldnames)

        run_id = conn.execute(
            "INSERT INTO import_runs (source_file, assumed_year, started_at) "
            "VALUES (?, ?, ?)",
            (source_file, year, datetime.now(timezone.utc).isoformat()),
        ).lastrowid

        current_year = year
        previous_month: int | None = None

        for row_number, row in enumerate(reader, start=1):
            report.total_rows += 1
            line_id = (row.get("LineId") or "").strip()
            source_line = int(line_id) if line_id.isdigit() else row_number

            def reject(reason: str) -> None:
                report.rejected += 1
                report.reject_reasons[reason] += 1
                conn.execute(
                    "INSERT INTO import_rejects "
                    "(import_run_id, source_line, reason, raw_row) VALUES (?, ?, ?, ?)",
                    (run_id, source_line, reason, json.dumps(row)),
                )

            content = (row.get("Content") or "").strip()
            if not content:
                reject("empty message")
                continue

            month_name = (row.get("Date") or "").strip().title()[:3]
            month_number = MONTHS.get(month_name)
            if month_number is not None:
                if previous_month is not None and previous_month - month_number >= _YEAR_ROLLOVER_GAP:
                    current_year += 1
                previous_month = month_number

            try:
                event_time = build_timestamp(
                    row["Date"], row["Day"], row["Time"], current_year
                )
            except (ValueError, TypeError, AttributeError):
                reject("invalid timestamp")
                continue

            parsed = parse_message(content)
            pid_text = (row.get("Pid") or "").strip()

            cursor = conn.execute(
                "INSERT OR IGNORE INTO events ("
                " event_time, host, process, pid, event_type, outcome, username,"
                " source_ip, source_port, auth_method, invalid_user, repeat_count,"
                " raw_message, source_file, source_line, import_run_id"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    event_time.isoformat(timespec="seconds"),
                    (row.get("Host") or "").strip() or None,
                    (row.get("Component") or "").strip() or None,
                    int(pid_text) if pid_text.isdigit() else None,
                    parsed.event_type,
                    parsed.outcome,
                    parsed.username,
                    parsed.source_ip,
                    parsed.source_port,
                    parsed.auth_method,
                    int(parsed.invalid_user),
                    parsed.repeat_count,
                    content,
                    source_file,
                    source_line,
                    run_id,
                ),
            )
            if cursor.rowcount == 1:
                report.imported += 1
            else:
                report.duplicates += 1

        conn.execute(
            "UPDATE import_runs SET total_rows=?, imported=?, duplicates=?, rejected=? "
            "WHERE id=?",
            (report.total_rows, report.imported, report.duplicates, report.rejected, run_id),
        )
    conn.commit()
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import an OpenSSH structured CSV into SQLite.")
    parser.add_argument("--csv", required=True, help="path to the structured CSV")
    parser.add_argument("--db", default="authlens.db", help="SQLite database file")
    parser.add_argument(
        "--year", type=int, required=True,
        help="year the log was recorded (syslog timestamps have no year)",
    )
    args = parser.parse_args(argv)

    conn = connect(args.db)
    try:
        init_schema(conn)
        report = import_csv(conn, args.csv, args.year)
    except SchemaError as error:
        print(f"Import failed: {error}", file=sys.stderr)
        return 1
    finally:
        conn.close()

    print(report.summary())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
