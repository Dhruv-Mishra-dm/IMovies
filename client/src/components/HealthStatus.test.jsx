import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HealthStatus from './HealthStatus.jsx'
import { fetchHealth } from '../api/health.js'

vi.mock('../api/health.js', () => ({ fetchHealth: vi.fn() }))

const healthy = {
  ok: true,
  status: 200,
  kind: 'ok',
  data: {
    status: 'ok',
    uptimeSeconds: 12,
    db: { connected: true, writable: true, name: 'imovies', replicaSet: 'rs0', transactionsSupported: true },
  },
}

beforeEach(() => {
  fetchHealth.mockReset()
})

describe('<HealthStatus />', () => {
  it('shows a loading state, then the healthy result with details', async () => {
    fetchHealth.mockResolvedValue(healthy)
    render(<HealthStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking…')
    expect(await screen.findByText('API and database are healthy')).toBeInTheDocument()
    expect(screen.getByText('rs0')).toBeInTheDocument()
    expect(screen.getByText('12s')).toBeInTheDocument()
  })

  it('explains a degraded API (503 from the API)', async () => {
    fetchHealth.mockResolvedValue({
      ok: false,
      status: 503,
      kind: 'http-error',
      data: { status: 'degraded', db: { connected: false, writable: false, state: 'disconnected' } },
    })
    render(<HealthStatus />)
    expect(await screen.findByText('API is up, but the database is not available')).toBeInTheDocument()
    expect(screen.getByText('disconnected')).toBeInTheDocument()
  })

  it('explains when the API is unreachable', async () => {
    fetchHealth.mockResolvedValue({ ok: false, status: 502, kind: 'unreachable', data: null })
    render(<HealthStatus />)
    expect(await screen.findByText('API unreachable — is the server running?')).toBeInTheDocument()
  })

  it('does not claim health for an unexpected non-JSON response', async () => {
    fetchHealth.mockResolvedValue({ ok: false, status: 200, kind: 'invalid-response', data: null })
    render(<HealthStatus />)
    expect(await screen.findByText('Unexpected response from the server (HTTP 200)')).toBeInTheDocument()
    expect(screen.queryByText('API and database are healthy')).not.toBeInTheDocument()
  })

  it('re-checks when the button is clicked', async () => {
    fetchHealth.mockResolvedValueOnce({ ok: false, status: 0, kind: 'unreachable', data: null }).mockResolvedValueOnce(healthy)
    render(<HealthStatus />)
    await screen.findByText('API unreachable — is the server running?')

    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('API and database are healthy')).toBeInTheDocument()
    expect(fetchHealth).toHaveBeenCalledTimes(2)
  })
})
