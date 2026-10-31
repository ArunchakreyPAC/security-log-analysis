import { useEffect, useRef, useState } from 'react'
import { barPath, niceTicks } from '../lib/chart.js'
import { bucketLabel, bucketTitle, fmtInt } from '../lib/format.js'

const MARGIN = { left: 48, right: 12 }
const FAIL = { top: 22, bottom: 196 } // failed attempts panel (y range, px)
const OK = { top: 246, bottom: 294 } // successful logins panel
const HEIGHT = 322
const MAX_BAR = 24

function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    return () => observer.disconnect()
  }, [ref])
  return width
}

/**
 * Failed attempts (blue) over time, with successful logins (orange) in a second panel
 * on the same x axis. They are separate panels, not one dual-scale chart, because the
 * counts differ by orders of magnitude.
 */
export default function Timeline({ rows, kind, loading, onSelect }) {
  const wrapRef = useRef(null)
  const width = useWidth(wrapRef)
  const [hover, setHover] = useState(null)

  const n = rows.length
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 40)
  const band = n ? plotW / n : plotW
  const barW = Math.max(1, Math.min(MAX_BAR, band >= 5 ? band - 2 : band * 0.7))

  const maxFail = Math.max(0, ...rows.map((r) => r.failed_attempts))
  const maxOk = Math.max(0, ...rows.map((r) => r.successful_logins))
  const failTicks = niceTicks(maxFail, 4)
  const okTicks = niceTicks(maxOk, 2)
  const failTop = failTicks[failTicks.length - 1]
  const okTop = okTicks[okTicks.length - 1]
  const yFail = (v) => FAIL.bottom - (v / failTop) * (FAIL.bottom - FAIL.top)
  const yOk = (v) => OK.bottom - (v / okTop) * (OK.bottom - OK.top)
  const xCenter = (i) => MARGIN.left + band * (i + 0.5)

  const labelEvery = Math.max(1, Math.ceil(56 / band))
  const peakIndex = maxFail > 0 ? rows.findIndex((r) => r.failed_attempts === maxFail) : -1
  const focusable = n <= 60

  const active = hover === null ? null : rows[hover]
  // Beside the hovered column, flipping to its left near the right edge so it never covers the bar.
  const TIP_W = 206
  const tipLeft =
    hover === null
      ? 0
      : xCenter(hover) + band / 2 + TIP_W + 12 <= width
        ? xCenter(hover) + band / 2 + 8
        : Math.max(xCenter(hover) - band / 2 - TIP_W - 8, 8)

  return (
    <div ref={wrapRef} className={`timeline${loading ? ' is-loading' : ''}`}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Failed attempts and successful logins over time. Use the table view for exact values."
          onPointerLeave={() => setHover(null)}
        >
          {/* failed attempts panel */}
          {failTicks.map((tick) => (
            <g key={`f${tick}`}>
              <line className={tick === 0 ? 'baseline' : 'grid'} x1={MARGIN.left} x2={width - MARGIN.right} y1={yFail(tick)} y2={yFail(tick)} />
              <text className="tick" x={MARGIN.left - 8} y={yFail(tick) + 4} textAnchor="end">
                {fmtInt(tick)}
              </text>
            </g>
          ))}
          <text className="panel-title" x={MARGIN.left} y={12}>Failed attempts</text>

          {/* successful logins panel */}
          <text className="panel-title" x={MARGIN.left} y={OK.top - 14}>Successful logins</text>
          {okTicks.map((tick) => (
            <g key={`o${tick}`}>
              <line className={tick === 0 ? 'baseline' : 'grid'} x1={MARGIN.left} x2={width - MARGIN.right} y1={yOk(tick)} y2={yOk(tick)} />
              <text className="tick" x={MARGIN.left - 8} y={yOk(tick) + 4} textAnchor="end">
                {fmtInt(tick)}
              </text>
            </g>
          ))}

          {/* column wash behind the hovered bucket */}
          {hover !== null && (
            <rect className="wash" x={MARGIN.left + band * hover} y={FAIL.top - 6} width={band} height={OK.bottom - FAIL.top + 6} />
          )}

          {rows.map((row, i) => {
            const x = xCenter(i) - barW / 2
            const failH = FAIL.bottom - yFail(row.failed_attempts)
            const okH = OK.bottom - yOk(row.successful_logins)
            return (
              <g key={row.bucket}>
                <path className={`bar-1${hover === i ? ' is-hover' : ''}`} d={barPath(x, yFail(row.failed_attempts), barW, failH)} />
                <path className={`bar-2${hover === i ? ' is-hover' : ''}`} d={barPath(x, yOk(row.successful_logins), barW, okH)} />
                {row.successful_logins > 0 && (
                  <text className="value" x={xCenter(i)} y={yOk(row.successful_logins) - 6} textAnchor="middle">
                    {fmtInt(row.successful_logins)}
                  </text>
                )}
                {i % labelEvery === 0 && (
                  <text className="tick" x={xCenter(i)} y={OK.bottom + 18} textAnchor="middle">
                    {bucketLabel(row.bucket, kind)}
                  </text>
                )}
              </g>
            )
          })}

          {peakIndex >= 0 && (
            <text className="value" x={xCenter(peakIndex)} y={yFail(maxFail) - 7} textAnchor="middle">
              {fmtInt(maxFail)}
            </text>
          )}

          {/* hit targets: each full-height column is bigger than its bar */}
          {rows.map((row, i) => (
            <rect
              key={`hit${row.bucket}`}
              className="hit"
              x={MARGIN.left + band * i}
              y={FAIL.top - 6}
              width={band}
              height={OK.bottom - FAIL.top + 6}
              tabIndex={focusable ? 0 : -1}
              role="button"
              aria-label={`${bucketTitle(row.bucket, kind)}: ${row.failed_attempts} failed attempts, ${row.successful_logins} successful logins. Show these events.`}
              onPointerEnter={() => setHover(i)}
              onPointerMove={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect?.(row)
                }
              }}
            />
          ))}
        </svg>
      )}

      {active && (
        <div className="tooltip" style={{ left: tipLeft, top: 8 }}>
          <p className="tooltip-title">{bucketTitle(active.bucket, kind)}</p>
          <p className="tooltip-row">
            <span className="key key-1" />
            <strong>{fmtInt(active.failed_attempts)}</strong> failed attempts
          </p>
          <p className="tooltip-row">
            <span className="key key-2" />
            <strong>{fmtInt(active.successful_logins)}</strong> successful logins
          </p>
          <p className="tooltip-hint">Select to see these events</p>
        </div>
      )}
    </div>
  )
}

/** Exact values for the same buckets, for readers who prefer numbers. */
export function TimelineTable({ rows, kind }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">Failed attempts and successful logins per time bucket</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col" className="num">Failed attempts</th>
            <th scope="col" className="num">Successful logins</th>
            <th scope="col" className="num">Events</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.bucket}>
              <td>{bucketTitle(row.bucket, kind)}</td>
              <td className="num">{fmtInt(row.failed_attempts)}</td>
              <td className="num">{fmtInt(row.successful_logins)}</td>
              <td className="num">{fmtInt(row.events)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
