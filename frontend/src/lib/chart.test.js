import test from 'node:test'
import assert from 'node:assert/strict'
import { barPath, fillBuckets, niceStep, niceTicks } from './chart.js'

test('niceTicks gives whole-number axis steps', () => {
  assert.deepEqual(niceTicks(330), [0, 100, 200, 300, 400])
  assert.deepEqual(niceTicks(5), [0, 2, 4, 6])
  assert.deepEqual(niceTicks(10), [0, 5, 10])
  assert.deepEqual(niceTicks(0), [0, 1])
  assert.deepEqual(niceTicks(1, 2), [0, 1])
  assert.ok(niceTicks(1234).at(-1) >= 1234)
})

test('niceStep never drops below 1', () => {
  assert.equal(niceStep(0.2), 1)
  assert.equal(niceStep(82.5), 100)
  assert.equal(niceStep(2), 2)
})

const row = (bucket, failed = 0, ok = 0) => ({ bucket, events: failed + ok, failed_attempts: failed, successful_logins: ok })

test('fillBuckets inserts zero rows for quiet periods so time stays to scale', () => {
  const rows = [row('2025-12-10T09:00', 5), row('2025-12-10T09:30', 7)]
  const filled = fillBuckets(rows, 'ten_minutes')
  assert.deepEqual(filled.map((r) => r.bucket), [
    '2025-12-10T09:00', '2025-12-10T09:10', '2025-12-10T09:20', '2025-12-10T09:30',
  ])
  assert.equal(filled[1].failed_attempts, 0)
  assert.equal(filled[3].failed_attempts, 7)
})

test('fillBuckets crosses hour and day boundaries', () => {
  const rows = [row('2025-12-10T23:50', 1), row('2025-12-11T00:10', 1)]
  assert.deepEqual(fillBuckets(rows, 'ten_minutes').map((r) => r.bucket), [
    '2025-12-10T23:50', '2025-12-11T00:00', '2025-12-11T00:10',
  ])
  const hours = fillBuckets([row('2025-12-10T22', 1), row('2025-12-11T01', 1)], 'hour')
  assert.deepEqual(hours.map((r) => r.bucket), [
    '2025-12-10T22', '2025-12-10T23', '2025-12-11T00', '2025-12-11T01',
  ])
})

test('fillBuckets leaves tiny, complete or oversized series alone', () => {
  const one = [row('2025-12-10T09:00', 1)]
  assert.equal(fillBuckets(one, 'minute'), one)
  const complete = [row('2025-12-10T09:00', 1), row('2025-12-10T09:10', 1)]
  assert.equal(fillBuckets(complete, 'ten_minutes'), complete)
  const wide = [row('2025-12-01T00:00', 1), row('2025-12-30T00:00', 1)]
  assert.equal(fillBuckets(wide, 'minute'), wide)
})

test('barPath rounds the top only and ignores empty bars', () => {
  assert.equal(barPath(0, 0, 10, 0), '')
  const path = barPath(10, 20, 24, 100, 4)
  assert.ok(path.startsWith('M10,120 V24'))
  assert.ok(path.endsWith('Z'))
  // radius never exceeds the bar height or half the width
  assert.ok(barPath(0, 0, 2, 100, 4).includes('Q0,0 1,0'))
})
