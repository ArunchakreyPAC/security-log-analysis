import { useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useDebounced } from '../hooks/useDebounced.js'
import { EMPTY_FILTERS } from '../lib/filters.js'
import { fmtInt, fmtShort } from '../lib/format.js'
import { FailIcon, OkIcon } from './Icons.jsx'
import Notice from './Notice.jsx'

const PAGE_SIZE = 25

const EVENT_LABELS = {
  auth_failure: 'Failed login',
  auth_success: 'Successful login',
  invalid_user: 'Unknown account',
  pam_auth_failure: 'PAM failure',
  other: 'Other',
}

/** A quiet dash for "nothing here", with a text equivalent for screen readers. */
function Dash({ meaning }) {
  return (
    <span className="muted">
      <span aria-hidden="true">–</span>
      <span className="visually-hidden">{meaning}</span>
    </span>
  )
}

function Outcome({ value }) {
  if (value === 'failure') return <span className="outcome"><FailIcon />Failed</span>
  if (value === 'success') return <span className="outcome"><OkIcon />Succeeded</span>
  return <Dash meaning="Not applicable" />
}

/**
 * Filterable, paginated event list. `filters` is owned by the parent so other parts of
 * the page (a timeline bar, an IP link) can set it. `lockIp` hides the IP field.
 */
export default function EventsTable({ filters, onChange, lockIp = false }) {
  const key = JSON.stringify(filters)
  const appliedKey = useDebounced(key, 350)
  const applied = useMemo(() => JSON.parse(appliedKey), [appliedKey])

  // The page belongs to one filter set; a new set starts again at page 1.
  const [position, setPosition] = useState({ key: appliedKey, page: 1 })
  const page = position.key === appliedKey ? position.page : 1
  const goTo = (next) => setPosition({ key: appliedKey, page: next })

  const { data, error, loading } = useApi('/events', { ...applied, page, page_size: PAGE_SIZE })

  const set = (name) => (event) => onChange({ [name]: event.target.value })
  const hasFilters = Object.entries(filters).some(([name, value]) => value && !(lockIp && name === 'ip'))
  const first = data && data.total ? (data.page - 1) * data.page_size + 1 : 0
  const last = data ? Math.min(data.page * data.page_size, data.total) : 0

  return (
    <div>
      <form className="filters" onSubmit={(event) => event.preventDefault()} aria-label="Event filters">
        {!lockIp && (
          <label className="field">
            <span>Source IP</span>
            <input type="text" value={filters.ip} onChange={set('ip')} placeholder="e.g. 183.62.140.253" autoComplete="off" />
          </label>
        )}
        <label className="field">
          <span>Username</span>
          <input type="text" value={filters.username} onChange={set('username')} placeholder="e.g. root" autoComplete="off" />
        </label>
        <label className="field">
          <span>Event</span>
          <select value={filters.event_type} onChange={set('event_type')}>
            <option value="">All events</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Outcome</span>
          <select value={filters.outcome} onChange={set('outcome')}>
            <option value="">Any outcome</option>
            <option value="failure">Failed</option>
            <option value="success">Succeeded</option>
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input type="datetime-local" step="1" value={filters.start} onChange={set('start')} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="datetime-local" step="1" value={filters.end} onChange={set('end')} />
        </label>
        {hasFilters && (
          <button type="button" className="text-button" onClick={() => onChange({ ...EMPTY_FILTERS, ...(lockIp ? { ip: filters.ip } : {}) })}>
            Clear filters
          </button>
        )}
      </form>

      {error && <Notice title="Couldn’t load events">{error}</Notice>}

      {data && !error && (
        <div className={loading ? 'is-loading' : undefined}>
          <div className="table-wrap">
            <table className="events">
              <caption className="visually-hidden">Authentication events, oldest first</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Event</th>
                  <th scope="col">Account</th>
                  <th scope="col">Source IP</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Log message</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => (
                  <tr key={event.id}>
                    <td className="nowrap">{fmtShort(event.event_time)}</td>
                    <td className="nowrap">
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                      {event.repeat_count > 1 && <span className="tag">×{event.repeat_count}</span>}
                    </td>
                    <td>{event.username ?? <Dash meaning="No account" />}</td>
                    <td>
                      {event.source_ip
                        ? lockIp
                          ? event.source_ip
                          : <a href={`#/ip/${encodeURIComponent(event.source_ip)}`}>{event.source_ip}</a>
                        : <Dash meaning="No source IP" />}
                    </td>
                    <td className="nowrap"><Outcome value={event.outcome} /></td>
                    <td className="message" title={event.raw_message}>{event.raw_message}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">No events match these filters. Clear a filter or widen the time range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <p aria-live="polite">
              {data.total ? `Showing ${fmtInt(first)} to ${fmtInt(last)} of ${fmtInt(data.total)} events` : 'No events'}
            </p>
            <div className="pager-buttons">
              <button type="button" disabled={page <= 1} onClick={() => goTo(page - 1)}>Previous</button>
              <span>Page {fmtInt(data.total ? page : 0)} of {fmtInt(data.pages)}</span>
              <button type="button" disabled={page >= data.pages} onClick={() => goTo(page + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}
      {!data && !error && <p className="muted">Loading events</p>}
    </div>
  )
}
