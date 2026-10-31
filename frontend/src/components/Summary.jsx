import { fmtDateTime, fmtInt, fmtPct } from '../lib/format.js'

/** Headline numbers. Failed attempts is the one hero figure on the page. */
export default function Summary({
  data,
  loading,
  heroLabel = 'Failed login attempts',
  eventsLabel = 'Events in the log',
  showIps = true,
}) {
  if (!data) return <div className="summary summary-empty">{loading ? 'Loading summary' : ''}</div>
  return (
    <div className={`summary${loading ? ' is-loading' : ''}`}>
      <div className="hero">
        <p className="hero-label">{heroLabel}</p>
        <p className="hero-value">{fmtInt(data.failed_attempts)}</p>
        <p className="hero-note">
          Counts “Failed …” lines from sshd. PAM lines are left out because they often describe the
          same attempt.
        </p>
      </div>
      <dl className="figures">
        <div>
          <dt>{eventsLabel}</dt>
          <dd>{fmtInt(data.total_events)}</dd>
        </div>
        {showIps && (
          <div>
            <dt>Source IPs seen</dt>
            <dd>{fmtInt(data.unique_source_ips)}</dd>
          </div>
        )}
        <div>
          <dt>Successful logins</dt>
          <dd>{fmtInt(data.successful_logins)}</dd>
        </div>
        <div>
          <dt>Failure rate</dt>
          <dd>{fmtPct(data.failure_rate)}</dd>
          <dd className="figure-note">failed ÷ (failed + successful)</dd>
        </div>
        <div className="figures-span">
          <dt>Covers</dt>
          <dd className="figure-text">
            {data.first_event ? `${fmtDateTime(data.first_event)} to ${fmtDateTime(data.last_event)}` : 'No events'}
          </dd>
          <dd className="figure-note">
            Log times have no timezone, and the year was supplied when the file was imported.
          </dd>
        </div>
      </dl>
    </div>
  )
}
