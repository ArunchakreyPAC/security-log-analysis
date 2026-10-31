-- AuthLens schema. Timestamps are stored as ISO-8601 text ("YYYY-MM-DDTHH:MM:SS")
-- with no timezone offset: see README "Timestamp assumptions".

CREATE TABLE IF NOT EXISTS import_runs (
    id            INTEGER PRIMARY KEY,
    source_file   TEXT    NOT NULL,
    assumed_year  INTEGER NOT NULL,
    started_at    TEXT    NOT NULL,   -- UTC, ISO-8601
    total_rows    INTEGER NOT NULL DEFAULT 0,
    imported      INTEGER NOT NULL DEFAULT 0,
    duplicates    INTEGER NOT NULL DEFAULT 0,
    rejected      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY,
    event_time    TEXT    NOT NULL,
    host          TEXT,
    process       TEXT,
    pid           INTEGER,
    event_type    TEXT    NOT NULL
                  CHECK (event_type IN
                      ('auth_failure', 'auth_success', 'invalid_user',
                       'pam_auth_failure', 'other')),
    outcome       TEXT    CHECK (outcome IN ('success', 'failure')),
    username      TEXT,
    source_ip     TEXT,
    source_port   INTEGER,
    auth_method   TEXT,
    invalid_user  INTEGER NOT NULL DEFAULT 0 CHECK (invalid_user IN (0, 1)),
    repeat_count  INTEGER NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),
    raw_message   TEXT    NOT NULL,   -- original log message, kept as evidence
    source_file   TEXT    NOT NULL,
    source_line   INTEGER NOT NULL,
    import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
    -- Re-importing the same file cannot create duplicate events.
    UNIQUE (source_file, source_line)
);

CREATE TABLE IF NOT EXISTS import_rejects (
    id            INTEGER PRIMARY KEY,
    import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
    source_line   INTEGER NOT NULL,
    reason        TEXT    NOT NULL,
    raw_row       TEXT    NOT NULL    -- the rejected CSV row as JSON
);

-- Indexes chosen for the dashboard's filters and the "N failures in M minutes"
-- detection query (per-IP, ordered by time).
CREATE INDEX IF NOT EXISTS idx_events_time        ON events (event_time);
CREATE INDEX IF NOT EXISTS idx_events_ip_time     ON events (source_ip, event_time);
CREATE INDEX IF NOT EXISTS idx_events_user_time   ON events (username, event_time);
CREATE INDEX IF NOT EXISTS idx_events_outcome_time ON events (outcome, event_time);
