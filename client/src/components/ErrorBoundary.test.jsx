import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as authApi from '../api/auth.js'
import ErrorBoundary from './ErrorBoundary.jsx'
import { renderApp, ok, admin } from '../test/renderApp.jsx'

vi.mock('../api/auth.js', () => ({ getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() }))
// Simulates the admin code chunk failing to download (e.g. the site was rebuilt while the tab was open).
vi.mock('../pages/admin/AdminLayout.jsx', () => {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/AdminLayout-abc.js')
})

const SECRET_DETAIL = 'secret internal detail at db.js:42'
function Broken() {
  throw new Error(SECRET_DETAIL)
}

beforeEach(() => {
  // React logs caught render errors to the console; keep test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('ErrorBoundary', () => {
  it('renders its children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a friendly fallback without the error message or stack, and Reload reloads', async () => {
    const onReload = vi.fn()
    render(
      <ErrorBoundary onReload={onReload}>
        <Broken />
      </ErrorBoundary>,
    )
    const alert = screen.getByRole('alert')
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(alert).not.toHaveTextContent(SECRET_DETAIL)
    expect(alert).not.toHaveTextContent(/at |\.js/)
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')

    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('recovers when the reset key changes (e.g. the user navigates elsewhere)', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/broken">
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(
      <ErrorBoundary resetKey="/movies">
        <p>Movies page</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Movies page')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the app usable when a lazy-loaded page fails to load: header stays, fallback replaces the page', async () => {
    authApi.getMe.mockResolvedValue(ok({ user: admin }))
    renderApp('/admin')
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).not.toHaveTextContent(/dynamically imported|AdminLayout/)
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    // The site header (outside the page boundary) still renders, so the user can navigate away.
    expect(screen.getByRole('link', { name: 'Movies' })).toBeInTheDocument()
  })
})
