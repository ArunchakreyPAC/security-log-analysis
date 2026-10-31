import { useEffect, useState } from 'react'
import { getJson, toQuery } from '../api.js'

/**
 * Fetch JSON from the API. While a new request is in flight the previous data stays
 * available (`loading` is true), so charts can dim instead of flashing empty.
 */
export function useApi(path, params) {
  const url = `${path}${toQuery(params) ? `?${toQuery(params)}` : ''}`
  const [state, setState] = useState({ data: null, error: null, loading: true })

  useEffect(() => {
    const controller = new AbortController()
    setState((current) => ({ ...current, loading: true, error: null }))
    getJson(url, controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name === 'AbortError') return
        setState((current) => ({ ...current, error: error.message, loading: false }))
      })
    return () => controller.abort()
  }, [url])

  return state
}
