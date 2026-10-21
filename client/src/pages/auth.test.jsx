import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as authApi from '../api/auth.js'
import { renderApp, customer, admin, ok, fail } from '../test/renderApp.jsx'
import { safeNextPath } from '../utils/navigation.js'

vi.mock('../api/movies.js', () => {
  const empty = { ok: true, status: 200, kind: 'ok', data: { items: [], page: 1, pageSize: 8, total: 0, totalPages: 1, genres: [], languages: [] } }
  return { listMovies: vi.fn(async () => empty), getMovieFilters: vi.fn(async () => empty), getMovie: vi.fn() }
})

vi.mock('../api/auth.js', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
}))

const anonymous = () => authApi.getMe.mockResolvedValue(fail(401, 'AUTH_REQUIRED'))
const location = () => screen.getByTestId('location').textContent

beforeEach(() => {
  vi.clearAllMocks()
})

describe('login page', () => {
  it('validates the form before calling the API', async () => {
    anonymous()
    renderApp('/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }))
    expect(screen.getByText('Enter your email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('clears a field error as soon as the user edits that field', async () => {
    anonymous()
    renderApp('/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }))
    expect(screen.getByText('Enter your email address')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Email'), 'a')
    expect(screen.queryByText('Enter your email address')).not.toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument() // other fields keep theirs
  })

  it('logs in and returns to the page the user came from', async () => {
    anonymous()
    authApi.login.mockResolvedValue(ok({ user: customer }))
    renderApp('/login?next=%2Faccount')
    await userEvent.type(await screen.findByLabelText('Email'), 'asha@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(location()).toBe('/account'))
    expect(authApi.login).toHaveBeenCalledWith({ email: 'asha@example.test', password: 'secret123' })
    expect(await screen.findByRole('heading', { name: 'My account' })).toBeInTheDocument()
  })

  it('shows the generic server error for wrong credentials', async () => {
    anonymous()
    authApi.login.mockResolvedValue(fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password'))
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'asha@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })

  it('never redirects to another site after login', () => {
    expect(safeNextPath('/bookings')).toBe('/bookings')
    expect(safeNextPath('https://evil.example')).toBe('/')
    expect(safeNextPath('//evil.example')).toBe('/')
    expect(safeNextPath('/\\evil.example')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
  })
})

describe('registration page', () => {
  it('checks password rules and confirmation locally', async () => {
    anonymous()
    renderApp('/register')
    await userEvent.type(await screen.findByLabelText('Full name'), 'Asha')
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'lettersonly')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different1')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Include at least one letter and one number')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('shows a duplicate email next to the email field', async () => {
    anonymous()
    authApi.register.mockResolvedValue(fail(409, 'EMAIL_TAKEN', 'An account with this email already exists'))
    renderApp('/register')
    await userEvent.type(await screen.findByLabelText('Full name'), 'Asha')
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText(/already exists. Try logging in/)).toBeInTheDocument()
  })

  it('registers and lands on the home page signed in', async () => {
    anonymous()
    authApi.register.mockResolvedValue(ok({ user: customer }, 201))
    renderApp('/register')
    await userEvent.type(await screen.findByLabelText('Full name'), 'Asha Rao')
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(location()).toBe('/'))
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(await within(nav).findByText('Asha')).toBeInTheDocument()
  })
})

describe('route guards and navigation', () => {
  it('sends anonymous visitors from a protected page to login, remembering where they were going', async () => {
    anonymous()
    renderApp('/account')
    await waitFor(() => expect(location()).toBe('/login?next=%2Faccount'))
  })

  it('keeps logged-in users away from the login page', async () => {
    authApi.getMe.mockResolvedValue(ok({ user: customer }))
    renderApp('/login')
    await waitFor(() => expect(location()).toBe('/'))
  })

  it('shows the Admin link only to administrators', async () => {
    authApi.getMe.mockResolvedValue(ok({ user: customer }))
    const { unmount } = renderApp('/')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await within(nav).findByText('Asha')
    expect(within(nav).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    unmount()

    authApi.getMe.mockResolvedValue(ok({ user: admin }))
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })

  it('logs out from the header', async () => {
    authApi.getMe.mockResolvedValue(ok({ user: customer }))
    authApi.logout.mockResolvedValue(ok(null, 204))
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(await within(nav).findByRole('link', { name: 'Log in' })).toBeInTheDocument()
    expect(authApi.logout).toHaveBeenCalledTimes(1)
  })

  it('logging out from a protected page lands on the home page, not the login page', async () => {
    authApi.getMe.mockResolvedValue(ok({ user: customer }))
    authApi.logout.mockResolvedValue(ok(null, 204))
    renderApp('/account')
    await screen.findByRole('heading', { name: 'My account' })
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(location()).toBe('/'))
  })

  it('reconnects the real-time socket when the logged-in user changes, so personal events reach the right person', async () => {
    const { fakeSocket } = await import('../test/fakeSocket.js')
    anonymous()
    authApi.login.mockResolvedValue(ok({ user: customer }))
    renderApp('/login')
    await userEvent.type(await screen.findByLabelText('Email'), 'asha@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    expect(fakeSocket.connects).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(fakeSocket.connects).toBe(1))
    expect(fakeSocket.disconnects).toBe(1)
  })

  it('shows a not-found page for unknown URLs', async () => {
    anonymous()
    renderApp('/no-such-page')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('account page', () => {
  it('asks for confirmation before logging out everywhere', async () => {
    authApi.getMe.mockResolvedValue(ok({ user: customer }))
    authApi.logoutAll.mockResolvedValue(ok(null, 204))
    renderApp('/account')
    await userEvent.click(await screen.findByRole('button', { name: 'Log out everywhere' }))
    expect(authApi.logoutAll).not.toHaveBeenCalled()
    const dialog = screen.getByRole('heading', { name: 'Log out on every device?' }).closest('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log out everywhere' }))
    await waitFor(() => expect(authApi.logoutAll).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(location()).toBe('/'))
  })
})
