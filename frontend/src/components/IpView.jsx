import { useCallback, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { EMPTY_FILTERS } from '../lib/filters.js'
import { bucketRange, fmtDateTime, fmtInt } from '../lib/format.js'
import { scrollToEvents } from '../lib/scroll.js'
import Block from './Block.jsx'
import BarList from './BarList.jsx'
import EventsTable from './EventsTable.jsx'
import Notice from './Notice.jsx'
import Summary from './Summary.jsx'
import TimelineSection from './TimelineSection.jsx'

/** Investigation view for one source IP. */
export default function IpView({ ip }) {
  const profile = useApi(`/ips/${encodeURIComponent(ip)}`)
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, ip })
  const update = useCallback((patch) => setFilters((current) => ({ ...current, ...patch, ip })), [ip])

  const showBucket = useCallback(
    (row, kind) => {
      const { start, end } = bucketRange(row.bucket, kind)
      update({ start, end })
      scrollToEvents()
    },
    [update],
  )

  const data = profile.data
  const summary = data && {
    failed_attempts: data.failed_attempts,
    total_events: data.total_events,
    unique_source_ips: 1,
    successful_logins: data.successful_logins,
    failure_rate:
      data.failed_attempts + data.successful_logins
        ? data.failed_attempts / (data.failed_attempts + data.successful_logins)
        : null,
    first_event: data.first_seen,
    last_event: data.last_seen,
  }

  return (
    <>
      <div className="crumbs">
        <a href="#/">Back to overview</a>
      </div>
      <h1 className="ip-title">{ip}</h1>

      {profile.error && (
        <Notice title={profile.error.startsWith('No events') ? 'This IP has no events' : 'Couldn’t load this IP'}>
          {profile.error}
        </Notice>
      )}

      {data && (
        <>
          <Summary
            data={summary}
            loading={profile.loading}
            heroLabel="Failed login attempts from this IP"
            eventsLabel="Events from this IP"
            showIps={false}
          />

          <Block
            id="ip-activity"
            title="Activity over time"
            description="Select a bar to list this IP’s events from that period."
          >
            <TimelineSection filters={{ ip }} defaultKind="minute" onSelect={showBucket} />
          </Block>

          <Block
            id="ip-accounts"
            title="Accounts it tried"
            description={`${fmtInt(data.accounts_tried)} different ${data.accounts_tried === 1 ? 'account' : 'accounts'}, first seen ${fmtDateTime(data.first_seen)}.`}
          >
            {data.targeted_accounts.length > 0 ? (
              <BarList
                ariaLabel={`Accounts targeted from ${ip}`}
                items={data.targeted_accounts.map((row) => ({
                  key: row.username,
                  label: row.username,
                  value: row.failed_attempts,
                  note: 'failed attempts',
                }))}
              />
            ) : (
              <p className="muted">This IP made no failed attempts against a named account.</p>
            )}
          </Block>

          <Block id="events" title="Events from this IP" description="In time order, with the original log message.">
            <EventsTable filters={filters} onChange={update} lockIp />
          </Block>
        </>
      )}
    </>
  )
}
