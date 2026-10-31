import { fmtInt } from '../lib/format.js'

/** Ranked rows with a proportional bar: label, bar, value, note. */
export default function BarList({ items, ariaLabel }) {
  const max = Math.max(1, ...items.map((item) => item.value))
  return (
    <ul className="barlist" aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.key}>
          <span className="barlist-label">
            {item.label}
            {item.tag && <span className="tag">{item.tag}</span>}
          </span>
          <span className="barlist-track" aria-hidden="true">
            <span className="barlist-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="barlist-value">{fmtInt(item.value)}</span>
          <span className="barlist-note">{item.note}</span>
        </li>
      ))}
    </ul>
  )
}
