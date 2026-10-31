import { useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useIntSetting } from '../hooks/useDebounced.js'
import { fmtInt, fmtShort } from '../lib/format.js'
import Notice from './Notice.jsx'
import NumberField from './NumberField.jsx'

/** Successful logins that came right after repeated failures from the same IP. */
export default function SuccessAfterFailures({ successfulLogins }) {
  const [failuresRaw, setFailuresRaw] = useState('5')
  const [windowRaw, setWindowRaw] = useState('10')
  const failures = useIntSetting(failuresRaw, { min: 1, max: 10000, initial: 5 })
  const windowMinutes = useIntSetting(windowRaw, { min: 1, max: 1440, initial: 10 })
  const { data, error, loading } = useApi('/alerts/success-after-failures', {
    min_failures: failures,
    window_minutes: windowMinutes,
  })

  return (
    <div className={loading ? 'is-loading' : undefined}>
      <p className="rule">
        Flag a successful login when the same IP made at least{' '}
        <NumberField label="Failed attempts before the login" value={failuresRaw} onChange={setFailuresRaw} min={1} max={10000} />{' '}
        failed attempts in the{' '}
        <NumberField label="Window in minutes" value={windowRaw} onChange={setWindowRaw} min={1} max={1440} />{' '}
        minutes before it.
      </p>

      {error && <Notice title="Couldn’t load this check">{error}</Notice>}

      {data && data.alerts.length === 0 && (
        <div className="empty-state">
          <p>No successful login followed {fmtInt(failures)} or more failed attempts from the same IP within {fmtInt(windowMinutes)} minutes.</p>
          {successfulLogins !== undefined && (
            <p className="muted">
              This log holds {fmtInt(successfulLogins)} successful {successfulLogins === 1 ? 'login' : 'logins'} in total, so
              there is little to match. The rule is covered by tests that use clearly labelled synthetic data.
            </p>
          )}
        </div>
      )}

      {data && data.alerts.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Successful logins that followed repeated failures</caption>
            <thead>
              <tr>
                <th scope="col">Login time</th>
                <th scope="col">Account</th>
                <th scope="col">Source IP</th>
                <th scope="col" className="num">Failed attempts before</th>
              </tr>
            </thead>
            <tbody>
              {data.alerts.map((alert) => (
                <tr key={`${alert.success_time}-${alert.source_ip}-${alert.username}`}>
                  <td className="nowrap">{fmtShort(alert.success_time)}</td>
                  <td>{alert.username}</td>
                  <td><a href={`#/ip/${encodeURIComponent(alert.source_ip)}`}>{alert.source_ip}</a></td>
                  <td className="num">{fmtInt(alert.failures_before)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!data && !error && <p className="muted">Loading</p>}
    </div>
  )
}
