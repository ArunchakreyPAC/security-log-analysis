# AuthLens

SSH authentication log analytics: import OpenSSH logs into SQLite, then query them to answer
*who tried to log in, from where, and what happened?*

**Status:** ingestion layer done (parser, schema, idempotent importer, tests).
Next: SQL detection queries, API, small dashboard.

## Quick start


pip install -r requirements.txt
python -m pytest                       # run the tests

# download OpenSSH_2k.log_structured.csv from Loghub into sample-data/ (see Data source)
python -m authlens.importer `
  --csv sample-data/OpenSSH_2k.log_structured.csv `
  --db authlens.db --year 2025

Example output:

```
Rows read:   13
Imported:    11
Duplicates:  0
Rejected:    2
  - invalid timestamp: 1
  - empty message: 1
```

## Data source

- **Loghub, OpenSSH** (SSH server logs from a lab environment): https://github.com/logpai/loghub
  (see the `OpenSSH` folder). Attribution: He et al., *Loghub: A Large Collection of System Log
  Datasets for AI-driven Log Analytics*. Check Loghub's own terms for permitted use before
  redistributing the data; this repository does not include it.
- `tests/fixtures/synthetic_openssh_sample.csv` is **synthetic**, hand-written for tests, using
  reserved documentation IP ranges (203.0.113.0/24, 198.51.100.0/24). It is not real traffic.

## Expected CSV columns

Required: `Date` (month name), `Day`, `Time`, `Content`.
Used if present: `LineId`, `Pid`, and `Component`.

In Loghub's structured OpenSSH CSV the `Component` column holds the **hostname** (e.g. `LabSZ`),
not the process name, so it is stored as `host`. Verified against `OpenSSH_2k.log_structured.csv`
(2,000 rows: all imported, none rejected).

If a required column is missing the import stops with an error that lists the columns found.

## Schema

| Table | Purpose |
|---|---|
| `events` | One row per log line: time, process, event type, outcome, username, source IP/port, auth method, plus the original `raw_message`, `source_file` and `source_line` as evidence |
| `import_runs` | One row per import with row counts and the assumed year |
| `import_rejects` | Rejected rows with the reason and the original row |

Idempotency: `UNIQUE (source_file, source_line)` plus `INSERT OR IGNORE`, so re-importing a file
inserts nothing and reports every row as a duplicate.

Indexes support the dashboard filters and the planned "N failures within M minutes per IP"
query: `(source_ip, event_time)`, `(username, event_time)`, `(outcome, event_time)`, `(event_time)`.

## Supported messages

| Message | `event_type` | `outcome` |
|---|---|---|
| `Failed <method> for [invalid user] <user> from <ip> port <n>` | `auth_failure` | failure |
| `Accepted <method> for <user> from <ip> port <n>` | `auth_success` | success |
| `Invalid user <user> from <ip>` | `invalid_user` | (none) |
| `pam_unix(sshd:auth): authentication failure; ... rhost=<ip> user=<user>` | `pam_auth_failure` | failure |
| anything else | `other` | (none) |

`message repeated N times: [...]` lines are stored once with `repeat_count = N`.
Malformed IPs are stored as NULL rather than guessed.

## Timestamp assumptions

- syslog timestamps have **no year**, so `--year` is required. If the month jumps backwards by
  6 or more (e.g. Dec to Jan), the year is incremented.
- No timezone is recorded in the source, so times are stored as naive local-lab time
  (`YYYY-MM-DDTHH:MM:SS`, no offset). Do not compare them with logs from other sources without
  establishing the timezone.

## Known limitations

- Usernames containing spaces are not handled in `Failed password` messages.
- Only the message formats above are parsed; other sshd messages are kept as `other`.
- The real Loghub 2k sample is mostly failed logins, so it has few or no successful-after-failure
  sequences. Use the synthetic fixture (clearly labelled) to test that detection.

## Roadmap

1. SQL detection queries: N failures from one IP in M minutes (window function), success after
   repeated failures (CTE).
2. Small API with pagination and parameterised, validated filters.
3. Minimal dashboard: summary cards, timeline, filterable event table, IP/account investigation view.
4. Docker Compose and CI.

## Known limitations / TODO

- [ ] **Source identity uses filename + line number.** Two different files with the same
      name would collide. Fix: key on a SHA-256 hash of the file contents.
- [ ] **`INSERT OR IGNORE` can hide constraint violations** by reporting them as duplicates.
      Fix: use `ON CONFLICT (source_file, source_line) DO NOTHING` so other errors raise.
- PAM and `Failed password` lines can describe the same attempt. Queries base "failed
  login attempts" on `event_type = 'auth_failure'` and sum `repeat_count`.
- Usernames containing spaces are not handled in `Failed password` messages.
- Only the message formats above are parsed; other sshd messages are kept as `other`.


### Citation

Jieming Zhu, Shilin He, Pinjia He, Jinyang Liu, Michael R. Lyu.
[Loghub: A Large Collection of System Log Datasets for AI-driven Log Analytics](https://arxiv.org/abs/2008.06448).
IEEE International Symposium on Software Reliability Engineering (ISSRE), 2023.

- `tests/fixtures/synthetic_openssh_sample.csv` is **synthetic**, hand-written for tests, using
  reserved documentation IP ranges (203.0.113.0/24, 198.51.100.0/24). It is not real traffic.