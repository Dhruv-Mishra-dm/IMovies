import { afterEach, describe, expect, it } from 'vitest'
import { AxiosError, CanceledError } from 'axios'
import { apiRequest, http } from './client.js'

const originalAdapter = http.defaults.adapter

// Replace axios' network layer with a fake that returns a canned response or error.
function respondWith({ status = 200, data, contentType = 'application/json' }) {
  http.defaults.adapter = async (config) => {
    const response = { status, statusText: '', data, headers: { 'content-type': contentType }, config, request: {} }
    if (status >= 200 && status < 300) return response
    throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, {}, response)
  }
}
function failWith(code) {
  http.defaults.adapter = async (config) => {
    throw new AxiosError('network', code, config, {})
  }
}

afterEach(() => {
  http.defaults.adapter = originalAdapter
})

describe('apiRequest()', () => {
  it('returns ok for a JSON 2xx response', async () => {
    respondWith({ data: { status: 'ok' } })
    expect(await apiRequest('/api/health')).toEqual({ ok: true, status: 200, data: { status: 'ok' }, kind: 'ok' })
  })

  it('does NOT treat a 2xx HTML page as success (audit defect)', async () => {
    respondWith({ data: '<!doctype html><html></html>', contentType: 'text/html' })
    expect(await apiRequest('/api/health')).toMatchObject({ ok: false, status: 200, kind: 'invalid-response' })
  })

  it('returns the API error body for JSON error responses', async () => {
    respondWith({ status: 404, data: { error: { code: 'NOT_FOUND', message: 'Movie not found' } } })
    const result = await apiRequest('/api/movies/1')
    expect(result).toMatchObject({ ok: false, status: 404, kind: 'http-error' })
    expect(result.data.error.code).toBe('NOT_FOUND')
  })

  it('keeps the API JSON 503 as an http-error (database down, API up)', async () => {
    respondWith({ status: 503, data: { status: 'degraded' } })
    expect(await apiRequest('/api/health')).toMatchObject({ status: 503, kind: 'http-error' })
  })

  it('reports a non-JSON 502 from a proxy as unreachable (audit defect)', async () => {
    respondWith({ status: 502, data: '', contentType: 'text/plain' })
    expect(await apiRequest('/api/health')).toMatchObject({ ok: false, status: 502, kind: 'unreachable' })
  })

  it('reports network failures as unreachable', async () => {
    failWith('ERR_NETWORK')
    expect(await apiRequest('/api/health')).toEqual({ ok: false, status: 0, data: null, kind: 'unreachable' })
  })

  it('reports timeouts separately', async () => {
    failWith('ECONNABORTED')
    expect(await apiRequest('/api/health')).toMatchObject({ ok: false, kind: 'timeout' })
  })

  it('rejects when the request is cancelled so callers can ignore it', async () => {
    http.defaults.adapter = (config) =>
      new Promise((_, reject) => config.signal.addEventListener('abort', () => reject(new CanceledError())))
    const controller = new AbortController()
    const pending = apiRequest('/api/health', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(CanceledError)
  })
})
