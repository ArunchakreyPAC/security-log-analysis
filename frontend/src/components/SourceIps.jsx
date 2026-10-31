import { useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useIntSetting } from '../hooks/useDebounced.js'
import { fmtClock, fmtInt, fmtShort } from '../lib/format.js'
import { FlagIcon } from './Icons.jsx'
import Notice from './Notice.jsx'
import NumberField from './NumberField.jsx'

const PREVIEW = 10

function span(first, last) {
  if (first.slice(0, 10) === last.slice(0, 10)) return `${fmtClock(first)} to ${fmtClock(last)}`
  return `${fmtShort(first)} to ${fmtShort(last)}`
}

/** Source IPs ranked by failed attempts, with the repeated-failures rule applied. */
export default function SourceIps() {
  const [thresholdRaw, setThresholdRaw] = useState('5')
  const [windowRaw, setWindowRaw] = useState('5')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const threshold = useIntSetting(thresholdRaw, { min: 1, max: 10000, initial: 5 })
  const windowMinutes = useIntSetting(windowRaw, { min: 1, max: 1440, initial: 5 })

  const top = useApi('/top/ips', { limit: 100 })
  const alerts = useApi('/alerts/repeated-failures', { threshold, window_minutes: windowMinutes })

  const flagged = useMemo(
    () => new Map((alerts.data?.alerts ?? []).map((alert) => [alert.source_ip, alert])),
    [alerts.data],
  )
  const all = top.data ?? []
  const maxFailed = Math.max(1, ...all.map((row) => row.failed_attempts))
  const rows = all.filter((row) => !onlyFlagged || flagged.has(row.source_ip))
  const shown = expanded ? rows : rows.slice(0, PREVIEW)
  const error = top.error ?? alerts.error

  return (
    <div className={top.loading || alerts.loading ? 'is-loading' : undefined}>
      <p className="rule">
        Flag an IP that makes at least{' '}
        <NumberField label="Failed attempts to trigger the rule" value={thresholdRaw} onChange={setThresholdRaw} min={1} max={10000} />{' '}
        failed attempts within{' '}
        <NumberField label="Window in minutes" value={windowRaw} onChange={setWindowRaw} min={1} max={1440} />{' '}
        minutes.
      </p>

      {error && <Notice title="Couldn’t load source IPs">{error}</Notice>}

      {top.data && (
        <>
          <div className="toolbar">
            <p className="summary-line">
              <strong>{fmtInt(flagged.size)}</strong> of the {all.length >= 100 ? '100 busiest' : fmtInt(all.length)} IPs
              with failed attempts met the rule.
            </p>
            <label className="check">
              <input type="checkbox" checked={onlyFlagged} onChange={(event) => setOnlyFlagged(event.target.checked)} />
              Show flagged IPs only
            </label>
          </div>

          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Source IPs ranked by failed login attempts</caption>
              <thead>
                <tr>
                  <th scope="col">Source IP</th>
                  <th scope="col" colSpan={2}>Failed attempts</th>
                  <th scope="col" className="num">Accounts tried</th>
                  <th scope="col">Active</th>
                  <th scope="col">Rule</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const alert = flagged.get(row.source_ip)
                  return (
                    <tr key={row.source_ip}>
                      <td><a href={`#/ip/${encodeURIComponent(row.source_ip)}`}>{row.source_ip}</a></td>
                      <td className="num">{fmtInt(row.failed_attempts)}</td>
                      <td className="bar-cell" aria-hidden="true">
                        <span className="inbar" style={{ width: `${(row.failed_attempts / maxFailed) * 100}%` }} />
                      </td>
                      <td className="num">{fmtInt(row.accounts_tried)}</td>
                      <td className="nowrap">{span(row.first_seen, row.last_seen)}</td>
                      <td>
                        {alert ? (
                          <span className="flag" title={`First met the rule at ${fmtShort(alert.first_triggered_at)}`}>
                            <FlagIcon />
                            Peak {fmtInt(alert.peak_attempts_in_window)} in {windowMinutes} min
                          </span>
                        ) : (
                          <span className="muted">Below threshold</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {shown.length === 0 && (
                  <tr><td colSpan={6} className="empty">No source IPs met the rule. Lower the threshold or widen the window.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {rows.length > PREVIEW && (
            <button type="button" className="text-button" onClick={() => setExpanded((open) => !open)}>
              {expanded ? 'Show fewer' : `Show all ${fmtInt(rows.length)}`}
            </button>
          )}
        </>
      )}
      {!top.data && !error && <p className="muted">Loading source IPs</p>}
    </div>
  )
}
