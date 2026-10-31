import pytest

from authlens.parser import build_timestamp, parse_message


def test_failed_password_for_valid_user():
    p = parse_message("Failed password for root from 203.0.113.5 port 38927 ssh2")
    assert (p.event_type, p.outcome) == ("auth_failure", "failure")
    assert (p.username, p.source_ip, p.source_port) == ("root", "203.0.113.5", 38927)
    assert p.auth_method == "password"
    assert p.invalid_user is False


def test_failed_password_for_invalid_user_is_flagged():
    p = parse_message(
        "Failed password for invalid user webmaster from 203.0.113.5 port 38926 ssh2"
    )
    assert p.event_type == "auth_failure"
    assert p.username == "webmaster"
    assert p.invalid_user is True


def test_invalid_user_with_extra_space_before_name():
    # Real line from the Loghub sample: two spaces before the username.
    p = parse_message(
        "Failed password for invalid user  0101 from 5.188.10.180 port 36279 ssh2"
    )
    assert p.event_type == "auth_failure"
    assert (p.username, p.invalid_user) == ("0101", True)


def test_accepted_login_is_success():
    p = parse_message("Accepted publickey for alice from 198.51.100.7 port 49116 ssh2")
    assert (p.event_type, p.outcome) == ("auth_success", "success")
    assert p.username == "alice"
    assert p.auth_method == "publickey"


def test_invalid_user_line():
    p = parse_message("Invalid user admin from 203.0.113.9")
    assert p.event_type == "invalid_user"
    assert (p.username, p.source_ip) == ("admin", "203.0.113.9")
    assert p.outcome is None


def test_invalid_user_with_empty_name():
    p = parse_message("Invalid user  from 203.0.113.9")
    assert p.event_type == "invalid_user"
    assert p.username is None


def test_pam_failure_extracts_ip_and_user():
    p = parse_message(
        "pam_unix(sshd:auth): authentication failure; logname= uid=0 euid=0 "
        "tty=ssh ruser= rhost=203.0.113.5  user=root"
    )
    assert p.event_type == "pam_auth_failure"
    assert (p.source_ip, p.username) == ("203.0.113.5", "root")


def test_pam_failure_without_user():
    p = parse_message(
        "pam_unix(sshd:auth): authentication failure; logname= uid=0 euid=0 "
        "tty=ssh ruser= rhost=203.0.113.5"
    )
    assert p.event_type == "pam_auth_failure"
    assert p.username is None


def test_repeated_message_keeps_count():
    p = parse_message(
        "message repeated 5 times: [ Failed password for root from 203.0.113.5 port 1 ssh2]"
    )
    assert p.event_type == "auth_failure"
    assert p.repeat_count == 5


def test_unrecognised_message_is_other():
    p = parse_message("Connection closed by 203.0.113.5 [preauth]")
    assert p.event_type == "other"
    assert p.outcome is None and p.source_ip is None


def test_malformed_ip_is_dropped_not_stored():
    p = parse_message("Failed password for root from 999.1.1.1 port 22 ssh2")
    assert p.event_type == "auth_failure"
    assert p.source_ip is None


def test_build_timestamp():
    ts = build_timestamp("Dec", "10", "06:55:46", 2025)
    assert ts.isoformat() == "2025-12-10T06:55:46"


@pytest.mark.parametrize(
    "month, day, time_str",
    [("Foo", "10", "06:55:46"), ("Feb", "30", "06:55:46"), ("Dec", "10", "25:00:00"),
     ("Dec", "10", "06:55")],
)
def test_build_timestamp_rejects_bad_values(month, day, time_str):
    with pytest.raises(ValueError):
        build_timestamp(month, day, time_str, 2025)