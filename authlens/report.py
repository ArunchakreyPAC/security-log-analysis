"""Print a text summary of an imported database.

Usage:
    python -m authlens.report --db authlens.db
"""
from __future__ import annotations

import argparse
import sqlite3
import sys

from . import queries
from .db import connect


def _print_table(title: str, rows: list[sqlite3.Row]) -> None:
    print(f"\n== {title} ==")
    if not rows:
        print("(none)")
        return
    headers = rows[0].keys()
    table = [[str(row[h]) for h in headers] for row in rows]
    widths = [max(len(h), *(len(r[i]) for r in table)) for i, h in enumerate(headers)]
    print("  ".join(h.ljust(w) for h, w in zip(headers, widths)))
    for line in table:
        print("  ".join(cell.ljust(w) for cell, w in zip(line, widths)))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Summarise an AuthLens database.")
    parser.add_argument("--db", default="authlens.db")
    parser.add_argument("--threshold", type=int, default=5, help="failures to trigger the rule")
    parser.add_argument("--window", type=int, default=5, help="rule window in minutes")
    args = parser.parse_args(argv)

    conn = connect(args.db)
    try:
        _print_table("Events by type", queries.event_counts(conn))
        _print_table("Top failing IPs", queries.top_failing_ips(conn))
        _print_table("Top targeted accounts", queries.top_targeted_accounts(conn))
        _print_table(
            f"Rule: >= {args.threshold} failures from one IP within {args.window} min",
            queries.repeated_failures(conn, args.threshold, args.window),
        )
        _print_table("Rule: success after repeated failures", queries.success_after_failures(conn))
    except sqlite3.OperationalError as error:
        print(f"Query failed: {error}. Has the database been imported?", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
