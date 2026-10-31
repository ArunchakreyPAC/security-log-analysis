"""AuthLens HTTP API (FastAPI).

Run from the project root:
    uvicorn authlens.api:app --reload
then open http://127.0.0.1:8000/docs for interactive documentation.

The database path comes from the AUTHLENS_DB environment variable (default: authlens.db).
The API opens the database read-only, so it can never modify imported evidence.
"""
import os
import sqlite3
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from . import queries, service
from .service import Filters, InvalidInput

app = FastAPI(
    title="AuthLens API",
    version="0.1.0",
    description=(
        "Query SSH authentication events imported from Loghub OpenSSH logs. "
        "Times have no timezone and use an assumed year (see README)."
    ),
)


@app.exception_handler(InvalidInput)
async def invalid_input_handler(request: Request, exc: InvalidInput):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(sqlite3.OperationalError)
async def database_error_handler(request: Request, exc: sqlite3.OperationalError):
    return JSONResponse(
        status_code=503,
        content={"detail": "Database is not ready. Run the importer first."},
    )


@contextmanager
def open_db():
    """Open the database read-only for the duration of one request."""
    path = Path(os.environ.get("AUTHLENS_DB", "authlens.db"))
    if not path.is_file():
        raise HTTPException(
            status_code=503, detail=f"Database '{path}' not found. Run the importer first."
        )
    conn = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def filter_params(
    ip: str | None = Query(None, description="Source IP address"),
    username: str | None = Query(None, description="Exact username"),
    host: str | None = Query(None, description="Exact host name"),
    start: str | None = Query(None, description="From, e.g. 2025-12-10T09:00:00 (inclusive)"),
    end: str | None = Query(None, description="Until, e.g. 2025-12-10T10:00:00 (inclusive)"),
) -> Filters:
    return Filters(ip=ip, username=username, host=host, start=start, end=end)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/summary")
def get_summary(filters: Filters = Depends(filter_params)):
    """Headline numbers. Failed attempts count 'Failed ...' lines only (not PAM duplicates)."""
    with open_db() as conn:
        return service.summary(conn, filters)


@app.get("/events")
def get_events(
    filters: Filters = Depends(filter_params),
    event_type: str | None = Query(None, description=", ".join(service.EVENT_TYPES)),
    outcome: str | None = Query(None, description="success or failure"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=service.MAX_PAGE_SIZE),
):
    """Paginated events, oldest first, filtered by any combination of fields."""
    filters = replace(filters, event_type=event_type, outcome=outcome)
    with open_db() as conn:
        return service.list_events(conn, filters, page, page_size)


@app.get("/timeline")
def get_timeline(
    bucket: str = Query("ten_minutes", description="minute, ten_minutes or hour"),
    filters: Filters = Depends(filter_params),
):
    """Failed attempts and successful logins per time bucket, for charting."""
    with open_db() as conn:
        return service.timeline(conn, bucket, filters)


@app.get("/top/ips")
def get_top_ips(limit: int = Query(10, ge=1, le=100)):
    with open_db() as conn:
        return [dict(r) for r in queries.top_failing_ips(conn, limit)]


@app.get("/top/accounts")
def get_top_accounts(limit: int = Query(10, ge=1, le=100)):
    with open_db() as conn:
        return [dict(r) for r in queries.top_targeted_accounts(conn, limit)]


@app.get("/alerts/repeated-failures")
def get_repeated_failures(
    threshold: int = Query(5, ge=1, le=10000),
    window_minutes: int = Query(5, ge=1, le=1440),
):
    """IPs with at least `threshold` failed attempts inside `window_minutes`."""
    with open_db() as conn:
        rows = queries.repeated_failures(conn, threshold, window_minutes)
    return {
        "rule": (
            f"At least {threshold} failed attempts from one IP within {window_minutes} minutes"
        ),
        "threshold": threshold,
        "window_minutes": window_minutes,
        "alerts": [dict(r) for r in rows],
    }


@app.get("/alerts/success-after-failures")
def get_success_after_failures(
    min_failures: int = Query(5, ge=1, le=10000),
    window_minutes: int = Query(10, ge=1, le=1440),
):
    """Successful logins from an IP that failed `min_failures`+ times just before."""
    with open_db() as conn:
        rows = queries.success_after_failures(conn, min_failures, window_minutes)
    return {
        "rule": (
            f"A successful login from an IP with at least {min_failures} failed attempts "
            f"in the preceding {window_minutes} minutes"
        ),
        "min_failures": min_failures,
        "window_minutes": window_minutes,
        "alerts": [dict(r) for r in rows],
    }


@app.get("/ips/{ip}")
def get_ip_profile(ip: str):
    """Investigation overview for one IP. Use /events?ip=... for its full event history."""
    with open_db() as conn:
        profile = service.ip_profile(conn, ip)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"No events found for {ip}")
    return profile
