// Tiny API client. In development, Vite proxies /api to the FastAPI server (see vite.config.js).
const BASE = import.meta.env?.VITE_API_BASE ?? '/api'

/** Build a query string, skipping empty values. */
export function toQuery(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  return search.toString()
}

/** FastAPI sends 422 details as a list of {msg}; our own validation sends a string. */
function messageFrom(body, fallback) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ')
  return fallback
}

export async function getJson(path, signal) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, { signal })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    const unreachable = new Error(
      "Can't reach the AuthLens API. Start it from the backend folder with: uvicorn authlens.api:app --reload",
    )
    unreachable.status = 0
    throw unreachable
  }
  if (!response.ok) {
    let body = null
    try {
      body = await response.json()
    } catch {
      // not JSON; fall back to the status text
    }
    const failure = new Error(messageFrom(body, response.statusText || `Request failed (${response.status})`))
    failure.status = response.status
    throw failure
  }
  return response.json()
}
