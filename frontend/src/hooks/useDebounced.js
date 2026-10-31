import { useEffect, useState } from 'react'

/** Returns `value` after it has stopped changing for `ms` milliseconds. */
export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/**
 * A whole-number setting typed into an input. Returns the last valid value, so a
 * half-typed or out-of-range entry never triggers a request.
 */
export function useIntSetting(raw, { min, max, initial }) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    const n = Number(raw)
    if (raw === '' || !Number.isInteger(n) || n < min || n > max) return undefined
    const timer = setTimeout(() => setValue(n), 300)
    return () => clearTimeout(timer)
  }, [raw, min, max])
  return value
}
