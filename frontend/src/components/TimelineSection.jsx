import { useMemo, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { fillBuckets } from '../lib/chart.js'
import Notice from './Notice.jsx'
import Timeline, { TimelineTable } from './Timeline.jsx'

const KINDS = [
  { value: 'minute', label: '1 minute' },
  { value: 'ten_minutes', label: '10 minutes' },
  { value: 'hour', label: '1 hour' },
]

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Controls, legend and chart (or table) for one timeline. `filters` scopes the data. */
export default function TimelineSection({ filters = {}, defaultKind = 'ten_minutes', onSelect }) {
  const [kind, setKind] = useState(defaultKind)
  const [view, setView] = useState('chart')
  const { data, error, loading } = useApi('/timeline', { bucket: kind, ...filters })
  const rows = useMemo(() => (data ? fillBuckets(data, kind) : []), [data, kind])

  return (
    <div>
      <div className="toolbar">
        <div className="legend" aria-label="Legend">
          <span><span className="swatch swatch-1" />Failed attempts</span>
          <span><span className="swatch swatch-2" />Successful logins</span>
        </div>
        <div className="toolbar-controls">
          <Segmented label="Bucket size" options={KINDS} value={kind} onChange={setKind} />
          <Segmented
            label="View"
            options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]}
            value={view}
            onChange={setView}
          />
        </div>
      </div>

      {error && <Notice title="Couldn’t load the timeline">{error}</Notice>}
      {!error && !data && <p className="muted">Loading timeline</p>}
      {data && data.length === 0 && <p className="muted">No events in this range.</p>}
      {data && data.length > 0 && (view === 'chart'
        ? <Timeline rows={rows} kind={kind} loading={loading} onSelect={(row) => onSelect?.(row, kind)} />
        : <TimelineTable rows={rows} kind={kind} />)}
    </div>
  )
}
