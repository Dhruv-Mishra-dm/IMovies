import axios from 'axios'

/**
 * Shared axios instance for the IMovies API.
 * - baseURL is empty in development: the Vite proxy forwards /api to Express (same origin).
 * - withCredentials sends the httpOnly auth cookies.
 * - timeout stops the UI waiting forever on a hung request.
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  timeout: 10_000,
})

export const SESSION_EXPIRED_EVENT = 'imovies:session-expired'

// ---------- Automatic session refresh ----------
// The access cookie lives 15 minutes. When a request fails with 401 because it expired (or is gone),
// we call /api/auth/refresh ONCE (shared by all requests failing at the same moment) and retry the
// original request ONCE. A failed refresh never triggers another refresh, so there is no loop.
// Retrying is safe even for POSTs: a 401 means the server rejected the request before doing anything.
const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'AUTH_REQUIRED'])
let refreshInFlight = null

export function refreshSession() {
  refreshInFlight ??= http
    .post('/api/auth/refresh', null, { skipAuthRefresh: true })
    .then(
      () => true,
      // 409 = another tab/request rotated the token a moment ago; its new cookie is already set.
      (err) => err.response?.status === 409,
    )
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

http.interceptors.response.use(undefined, async (error) => {
  const { config, response } = error
  const code = response?.data?.error?.code
  if (response?.status === 401 && REFRESHABLE.has(code) && config && !config.skipAuthRefresh && !config._retried) {
    config._retried = true
    if (await refreshSession()) return http.request(config)
    // The user had a session (token expired) but it can't be renewed: tell the app to log them out.
    if (code === 'TOKEN_EXPIRED') window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
  }
  throw error
})

const GATEWAY_STATUSES = new Set([502, 503, 504])

function isJsonObject(response) {
  const type = String(response.headers?.['content-type'] ?? '')
  return type.includes('application/json') && typeof response.data === 'object' && response.data !== null
}

/**
 * Calls the API and always resolves to a normalised result, so components handle every
 * outcome in one place instead of try/catch everywhere:
 *
 *   { ok: true,  status, data,  kind: 'ok' }
 *   { ok: false, status, data,  kind: 'http-error' }        API answered with an error (data.error has code/message)
 *   { ok: false, status, data: null, kind: 'unreachable' }   network down, or a proxy/gateway answered instead of the API
 *   { ok: false, status: 0, data: null, kind: 'timeout' }
 *   { ok: false, status, data: null, kind: 'invalid-response' }  2xx but not JSON (e.g. an HTML page)
 *
 * 204 No Content counts as ok with data = null. Cancelled requests (AbortController) still reject,
 * so callers can ignore them.
 */
export async function apiRequest(path, { method = 'GET', body, params, signal, headers } = {}) {
  try {
    const response = await http.request({ url: path, method, data: body, params, signal, headers })
    if (response.status === 204) return { ok: true, status: 204, data: null, kind: 'ok' }
    if (!isJsonObject(response)) {
      return { ok: false, status: response.status, data: null, kind: 'invalid-response' }
    }
    return { ok: true, status: response.status, data: response.data, kind: 'ok' }
  } catch (err) {
    if (axios.isCancel(err)) throw err
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { ok: false, status: 0, data: null, kind: 'timeout' }
    }
    const response = err.response
    if (!response) return { ok: false, status: 0, data: null, kind: 'unreachable' }
    if (isJsonObject(response)) {
      return { ok: false, status: response.status, data: response.data, kind: 'http-error' }
    }
    // A non-JSON 502/503/504 comes from a proxy (e.g. Vite when Express is down), not from our API.
    if (GATEWAY_STATUSES.has(response.status)) {
      return { ok: false, status: response.status, data: null, kind: 'unreachable' }
    }
    return { ok: false, status: response.status, data: null, kind: 'invalid-response' }
  }
}

/** A user-facing sentence for any failed apiRequest() result. */
export function errorMessage(result, fallback = 'Something went wrong. Please try again.') {
  if (!result || result.ok) return null
  switch (result.kind) {
    case 'unreachable':
      return 'Cannot reach the IMovies server. Check your connection and try again.'
    case 'timeout':
      return 'The server took too long to respond. Please try again.'
    case 'invalid-response':
      return 'The server sent an unexpected response. Please try again later.'
    default:
      return result.data?.error?.message ?? fallback
  }
}

/** Field errors from a VALIDATION_ERROR response, as { fieldName: message }. */
export function fieldErrors(result) {
  const details = result?.data?.error?.code === 'VALIDATION_ERROR' ? result.data.error.details : null
  if (!Array.isArray(details)) return {}
  return Object.fromEntries(details.filter((d) => d.path).map((d) => [d.path.split('.')[0], `This field ${d.message}`]))
}
