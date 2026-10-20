import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import { apiRequest, http, SESSION_EXPIRED_EVENT } from './client.js'

const originalAdapter = http.defaults.adapter

function json(config, status, data) {
  const response = { status, statusText: '', data, headers: { 'content-type': 'application/json' }, config, request: {} }
  if (status < 400) return response
  throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, {}, response)
}

/** Fake server: `routes[url]` returns [status, body] for each call (array = successive calls). */
function fakeServer(routes) {
  const calls = []
  http.defaults.adapter = async (config) => {
    calls.push(config.url)
    const handler = routes[config.url]
    const next = Array.isArray(handler) ? handler.shift() : handler(calls)
    return json(config, next[0], next[1])
  }
  return calls
}

afterEach(() => {
  http.defaults.adapter = originalAdapter
})

describe('automatic session refresh', () => {
  it('refreshes once and retries the original request when the access token expired', async () => {
    const calls = fakeServer({
      '/api/auth/me': [
        [401, { error: { code: 'TOKEN_EXPIRED' } }],
        [200, { user: { name: 'Asha' } }],
      ],
      '/api/auth/refresh': [[200, { user: {} }]],
    })
    const result = await apiRequest('/api/auth/me')
    expect(result).toMatchObject({ ok: true, data: { user: { name: 'Asha' } } })
    expect(calls).toEqual(['/api/auth/me', '/api/auth/refresh', '/api/auth/me'])
  })

  it('shares ONE refresh between requests that fail at the same time', async () => {
    let refreshCount = 0
    fakeServer({
      '/api/a': (calls) => (calls.filter((c) => c === '/api/a').length === 1 ? [401, { error: { code: 'TOKEN_EXPIRED' } }] : [200, { a: 1 }]),
      '/api/b': (calls) => (calls.filter((c) => c === '/api/b').length === 1 ? [401, { error: { code: 'TOKEN_EXPIRED' } }] : [200, { b: 1 }]),
      '/api/auth/refresh': () => {
        refreshCount += 1
        return [200, {}]
      },
    })
    const [a, b] = await Promise.all([apiRequest('/api/a'), apiRequest('/api/b')])
    expect(a.ok && b.ok).toBe(true)
    expect(refreshCount).toBe(1)
  })

  it('gives up after one retry (no infinite loop) and announces the expired session', async () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)
    const calls = fakeServer({
      '/api/auth/me': () => [401, { error: { code: 'TOKEN_EXPIRED' } }],
      '/api/auth/refresh': () => [401, { error: { code: 'SESSION_REVOKED' } }],
    })
    const result = await apiRequest('/api/auth/me')
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)

    expect(result).toMatchObject({ ok: false, status: 401 })
    expect(calls).toEqual(['/api/auth/me', '/api/auth/refresh'])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('treats a 409 refresh conflict (another tab refreshed) as success', async () => {
    fakeServer({
      '/api/auth/me': [
        [401, { error: { code: 'TOKEN_EXPIRED' } }],
        [200, { user: {} }],
      ],
      '/api/auth/refresh': [[409, { error: { code: 'REFRESH_CONFLICT' } }]],
    })
    expect((await apiRequest('/api/auth/me')).ok).toBe(true)
  })

  it('does not refresh for other errors such as 403 or wrong credentials', async () => {
    const calls = fakeServer({
      '/api/admin': [[403, { error: { code: 'FORBIDDEN' } }]],
      '/api/auth/login': [[401, { error: { code: 'INVALID_CREDENTIALS' } }]],
    })
    await apiRequest('/api/admin')
    await apiRequest('/api/auth/login', { method: 'POST', body: {} })
    expect(calls).toEqual(['/api/admin', '/api/auth/login'])
  })

  it('does not announce an expired session for a visitor who was never logged in', async () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)
    fakeServer({
      '/api/auth/me': () => [401, { error: { code: 'AUTH_REQUIRED' } }],
      '/api/auth/refresh': () => [401, { error: { code: 'REFRESH_REQUIRED' } }],
    })
    await apiRequest('/api/auth/me')
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
    expect(listener).not.toHaveBeenCalled()
  })

  it('treats 204 No Content as success', async () => {
    http.defaults.adapter = async (config) => ({ status: 204, statusText: '', data: '', headers: {}, config, request: {} })
    expect(await apiRequest('/api/auth/logout', { method: 'POST' })).toEqual({ ok: true, status: 204, data: null, kind: 'ok' })
  })
})
