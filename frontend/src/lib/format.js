// Formatting helpers. Stored times look like 2025-12-10T10:54:29 and have NO timezone,
// so they are parsed as plain text and never passed through Date (which would shift them).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const numbers = new Intl.NumberFormat('en-US')

export const fmtInt = (n) => (n === null || n === undefined ? '—' : numbers.format(n))

export const fmtPct = (ratio) =>
  ratio === null || ratio === undefined ? '—' : `${(ratio * 100).toFixed(1)}%`

function parts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso ?? '')
  if (!m) return null
  return { year: m[1], month: MONTHS[Number(m[2]) - 1], day: Number(m[3]), h: m[4], mi: m[5], s: m[6] ?? '00' }
}

/** 10 Dec 2025, 10:54:29 */
export function fmtDateTime(iso) {
  const p = parts(iso)
  return p ? `${p.day} ${p.month} ${p.year}, ${p.h}:${p.mi}:${p.s}` : '—'
}

/** 10 Dec, 10:54:29 */
export function fmtShort(iso) {
  const p = parts(iso)
  return p ? `${p.day} ${p.month}, ${p.h}:${p.mi}:${p.s}` : '—'
}

/** 10:54:29 */
export function fmtClock(iso) {
  const p = parts(iso)
  return p ? `${p.h}:${p.mi}:${p.s}` : '—'
}

// ---- timeline buckets -------------------------------------------------------------
// The API returns buckets as: minute 'YYYY-MM-DDTHH:MM', ten_minutes 'YYYY-MM-DDTHH:M0',
// hour 'YYYY-MM-DDTHH'.

/** Inclusive start/end filter values covering one bucket. */
export function bucketRange(bucket, kind) {
  if (kind === 'hour') return { start: `${bucket}:00:00`, end: `${bucket}:59:59` }
  if (kind === 'ten_minutes') return { start: `${bucket}:00`, end: `${bucket.slice(0, 15)}9:59` }
  return { start: `${bucket}:00`, end: `${bucket}:59` }
}

/** Short axis label: 10:50 */
export function bucketLabel(bucket, kind) {
  return kind === 'hour' ? `${bucket.slice(11, 13)}:00` : bucket.slice(11, 16)
}

/** Tooltip title: "10 Dec, 10:50 to 10:59" */
export function bucketTitle(bucket, kind) {
  const { start, end } = bucketRange(bucket, kind)
  const from = parts(start)
  const to = parts(end)
  if (kind === 'minute') return `${from.day} ${from.month}, ${from.h}:${from.mi}`
  return `${from.day} ${from.month}, ${from.h}:${from.mi} to ${to.h}:${to.mi}`
}
