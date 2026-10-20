import axios from 'axios'

/**
 * Shared axios instance for the IMovies API.
 * - baseURL is empty in development: the Vite proxy forwards /api to Express (same origin).
 * - withCredentials sends the httpOnly auth cookie (used from the auth epic onwards).
 * - timeout stops the UI waiting forever on a hung request.
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  timeout: 10_000,
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
 * Cancelled requests (AbortController) still reject, so callers can ignore them.
 */
export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  try {
    const response = await http.request({ url: path, method, data: body, signal })
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
