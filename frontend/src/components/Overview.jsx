import { useCallback, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { EMPTY_FILTERS } from '../lib/filters.js'
import { bucketRange } from '../lib/format.js'
import { scrollToEvents } from '../lib/scroll.js'
import Block from './Block.jsx'
import BarList from './BarList.jsx'
import EventsTable from './EventsTable.jsx'
import Notice from './Notice.jsx'
import SourceIps from './SourceIps.jsx'
import Summary from './Summary.jsx'
import SuccessAfterFailures from './SuccessAfterFailures.jsx'
import TimelineSection from './TimelineSection.jsx'

function Accounts() {
  const { data, error } = useApi('/top/accounts', { limit: 8 })
  if (error) return <Notice title="Couldn’t load accounts">{error}</Notice>
  if (!data) return <p className="muted">Loading accounts</p>
  return (
    <BarList
      ariaLabel="Most targeted accounts"
      items={data.map((row) => ({
        key: row.username,
        label: row.username,
        tag: row.is_invalid_user ? 'not on server' : undefined,
        value: row.failed_attempts,
        note: `from ${row.distinct_ips} ${row.distinct_ips === 1 ? 'IP' : 'IPs'}`,
      }))}
    />
  )
}

export default function Overview() {
  const summary = useApi('/summary')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const update = useCallback((patch) => setFilters((current) => ({ ...current, ...patch })), [])

  const showBucket = useCallback(
    (row, kind) => {
      const { start, end } = bucketRange(row.bucket, kind)
      update({ start, end })
      scrollToEvents()
    },
    [update],
  )

  return (
    <>
      {summary.error && (
        <Notice title="The dashboard has no data to show">{summary.error}</Notice>
      )}
      <Summary data={summary.data} loading={summary.loading} />

      <Block
        id="activity"
        title="Activity over time"
        description="Select a bar to list the events from that period."
      >
        <TimelineSection onSelect={showBucket} />
      </Block>

      <Block
        id="sources"
        title="Source IPs"
        description="Ranked by failed attempts. Select an IP to investigate its history."
      >
        <SourceIps />
      </Block>

      <Block
        id="accounts"
        title="Targeted accounts"
        description="Accounts marked “not on server” were rejected by sshd as unknown users."
      >
        <Accounts />
      </Block>

      <Block
        id="success"
        title="Logins after failures"
        description="A successful login right after many failures can mean a guessed password."
      >
        <SuccessAfterFailures successfulLogins={summary.data?.successful_logins} />
      </Block>

      <Block id="events" title="Events" description="Every parsed log line, oldest first. The original message is kept as evidence.">
        <EventsTable filters={filters} onChange={update} />
      </Block>
    </>
  )
}
