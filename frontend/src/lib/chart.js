// Pure chart helpers (no React), so they can be unit-tested.

const STEPS = [1, 2, 5, 10]

/** A "nice" whole-number step (1, 2, 5 x 10^k) for the given raw step. */
export function niceStep(raw) {
  if (raw <= 1) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  const step = STEPS.find((s) => fraction <= s + 1e-9) ?? 10
  return step * power
}

/** Axis ticks from 0 up to just past `max`, e.g. max 330 -> 0,100,200,300,400. */
export function niceTicks(max, count = 4) {
  const top = Math.max(max, 1)
  const step = niceStep(top / count)
  const steps = Math.ceil(top / step - 1e-9)
  return Array.from({ length: steps + 1 }, (_, i) => i * step)
}

const STEP_MS = { minute: 60_000, ten_minutes: 600_000, hour: 3_600_000 }

const toMs = (bucket) => Date.parse(`${bucket.length === 13 ? `${bucket}:00` : bucket}:00Z`)

function fromMs(ms, kind) {
  const iso = new Date(ms).toISOString()
  return kind === 'hour' ? iso.slice(0, 13) : iso.slice(0, 16)
}

/**
 * The API only returns buckets that contain events. Plotting those by position would
 * squash quiet periods out of the time axis, so insert zero-filled buckets for the gaps.
 * Returns the rows unchanged if the range would need more than `maxBuckets` bars.
 */
export function fillBuckets(rows, kind, maxBuckets = 720) {
  if (rows.length < 2) return rows
  const step = STEP_MS[kind]
  const first = toMs(rows[0].bucket)
  const last = toMs(rows[rows.length - 1].bucket)
  const count = Math.round((last - first) / step) + 1
  if (count > maxBuckets || count === rows.length) return rows
  const known = new Map(rows.map((row) => [row.bucket, row]))
  return Array.from({ length: count }, (_, i) => {
    const bucket = fromMs(first + i * step, kind)
    return known.get(bucket) ?? { bucket, events: 0, failed_attempts: 0, successful_logins: 0 }
  })
}

/** SVG path for a bar with a rounded top and a square base. */
export function barPath(x, y, width, height, radius = 4) {
  if (height <= 0 || width <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  return (
    `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} ` +
    `H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`
  )
}
