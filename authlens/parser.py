"""Turn raw OpenSSH (sshd) log messages and timestamps into structured fields.

Only the message formats listed in README "Supported messages" are recognised.
Anything else is kept as event_type "other" rather than discarded, so the
original evidence is never lost.
"""
from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from datetime import datetime

MONTHS = {
    name: number
    for number, name in enumerate(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
         "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        start=1,
    )
}

_IP = r"[0-9a-fA-F:.]+"

_REPEAT = re.compile(r"message repeated (\d+) times")
_FAILED = re.compile(
    rf"Failed (?P<method>\S+) for (?P<invalid>invalid user\s+)?(?P<user>\S+) "
    rf"from (?P<ip>{_IP}) port (?P<port>\d+)"
)
_ACCEPTED = re.compile(
    rf"Accepted (?P<method>\S+) for (?P<user>\S+) "
    rf"from (?P<ip>{_IP}) port (?P<port>\d+)"
)
_INVALID_USER = re.compile(rf"Invalid user (?P<user>.*?)\s*from (?P<ip>{_IP})")
_PAM_FAILURE = re.compile(
    r"pam_unix\(sshd:auth\): authentication failure;.*?"
    r"rhost=(?P<ip>\S*)\s*(?:user=(?P<user>\S+))?"
)


@dataclass(frozen=True)
class ParsedMessage:
    event_type: str
    outcome: str | None = None
    username: str | None = None
    source_ip: str | None = None
    source_port: int | None = None
    auth_method: str | None = None
    invalid_user: bool = False
    repeat_count: int = 1


def _valid_ip(value: str | None) -> str | None:
    """Return the IP if it is a real IPv4/IPv6 address, otherwise None."""
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def parse_message(content: str) -> ParsedMessage:
    """Classify one sshd message and extract username, IP, port and outcome."""
    repeat = _REPEAT.search(content)
    repeat_count = int(repeat.group(1)) if repeat else 1

    if m := _FAILED.search(content):
        return ParsedMessage(
            event_type="auth_failure",
            outcome="failure",
            username=m["user"],
            source_ip=_valid_ip(m["ip"]),
            source_port=int(m["port"]),
            auth_method=m["method"],
            invalid_user=m["invalid"] is not None,
            repeat_count=repeat_count,
        )
    if m := _ACCEPTED.search(content):
        return ParsedMessage(
            event_type="auth_success",
            outcome="success",
            username=m["user"],
            source_ip=_valid_ip(m["ip"]),
            source_port=int(m["port"]),
            auth_method=m["method"],
            repeat_count=repeat_count,
        )
    if m := _INVALID_USER.search(content):
        return ParsedMessage(
            event_type="invalid_user",
            username=m["user"].strip() or None,
            source_ip=_valid_ip(m["ip"]),
            invalid_user=True,
            repeat_count=repeat_count,
        )
    if m := _PAM_FAILURE.search(content):
        return ParsedMessage(
            event_type="pam_auth_failure",
            outcome="failure",
            username=m["user"],
            source_ip=_valid_ip(m["ip"]),
            repeat_count=repeat_count,
        )
    return ParsedMessage(event_type="other", repeat_count=repeat_count)


def build_timestamp(month: str, day: str, time_str: str, year: int) -> datetime:
    """Combine syslog-style month/day/time with an assumed year.

    Raises ValueError for an unknown month or an impossible date/time.
    """
    month_number = MONTHS.get(month.strip().title()[:3])
    if month_number is None:
        raise ValueError(f"unknown month {month!r}")
    hour, minute, second = (int(part) for part in time_str.strip().split(":"))
    return datetime(year, month_number, int(day), hour, minute, second)