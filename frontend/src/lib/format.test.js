import test from 'node:test'
import assert from 'node:assert/strict'
import { bucketLabel, bucketRange, bucketTitle, fmtClock, fmtDateTime, fmtInt, fmtPct, fmtShort } from './format.js'

test('numbers', () => {
  assert.equal(fmtInt(2000), '2,000')
  assert.equal(fmtInt(null), '—')
  assert.equal(fmtPct(0.9981), '99.8%')
  assert.equal(fmtPct(null), '—')
})

test('times are formatted from the text, never shifted by a timezone', () => {
  assert.equal(fmtDateTime('2025-12-10T10:54:29'), '10 Dec 2025, 10:54:29')
  assert.equal(fmtShort('2025-12-10T06:55:46'), '10 Dec, 06:55:46')
  assert.equal(fmtClock('2025-12-10T11:04:45'), '11:04:45')
  assert.equal(fmtDateTime('garbage'), '—')
  assert.equal(fmtDateTime(undefined), '—')
})

test('bucket ranges cover the whole bucket', () => {
  assert.deepEqual(bucketRange('2025-12-10T10:50', 'ten_minutes'), {
    start: '2025-12-10T10:50:00',
    end: '2025-12-10T10:59:59',
  })
  assert.deepEqual(bucketRange('2025-12-10T10:54', 'minute'), {
    start: '2025-12-10T10:54:00',
    end: '2025-12-10T10:54:59',
  })
  assert.deepEqual(bucketRange('2025-12-10T10', 'hour'), {
    start: '2025-12-10T10:00:00',
    end: '2025-12-10T10:59:59',
  })
})

test('bucket labels and titles', () => {
  assert.equal(bucketLabel('2025-12-10T10:50', 'ten_minutes'), '10:50')
  assert.equal(bucketLabel('2025-12-10T10', 'hour'), '10:00')
  assert.equal(bucketTitle('2025-12-10T10:50', 'ten_minutes'), '10 Dec, 10:50 to 10:59')
  assert.equal(bucketTitle('2025-12-10T10:54', 'minute'), '10 Dec, 10:54')
  assert.equal(bucketTitle('2025-12-10T10', 'hour'), '10 Dec, 10:00 to 10:59')
})
