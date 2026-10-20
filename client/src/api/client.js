const API_URL = import.meta.env.VITE_API_URL ?? ''

/**
 * Small wrapper around fetch for calling the IMovies API.
 * - `credentials: 'include'` sends the httpOnly auth cookie (used from Epic 1).
 * - Always resolves with { ok, status, data } so callers handle errors in one place,
 *   including the case where the server is unreachable (status 0).
 */
export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    if (err.name === 'AbortError') throw err
    return { ok: false, status: 0, data: null }
  }
}
