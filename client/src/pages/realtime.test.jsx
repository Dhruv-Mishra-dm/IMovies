import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import * as authApi from '../api/auth.js'
import * as cinemaApi from '../api/cinema.js'
import * as bookingsApi from '../api/bookings.js'
import { renderApp, ok, customer } from '../test/renderApp.jsx'
import { fakeSocket } from '../test/fakeSocket.js'

vi.mock('../api/auth.js', () => ({ getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() }))
vi.mock('../api/cinema.js', () => ({ getShowtime: vi.fn() }))
vi.mock('../api/bookings.js', () => ({ getSeatAvailability: vi.fn(), createBooking: vi.fn(), releaseBooking: vi.fn(), getBooking: vi.fn(), payBooking: vi.fn() }))

const showtime = {
  id: 's1',
  startsAt: '2099-11-02T13:00:00.000Z',
  language: 'Hindi',
  format: '2D',
  availability: 'OPEN',
  movie: { id: 'm1', title: 'Alpha', slug: 'alpha', certification: 'U' },
  theatre: { id: 't1', name: 'Galaxy' },
  screen: { id: 'sc1', name: 'Screen 1' },
  seatMap: { categories: [{ code: 'CLASSIC', name: 'Classic' }], rows: [{ label: 'A', seats: [1, 2, 3].map((n) => ({ number: n, col: n, category: 'CLASSIC' })) }] },
  prices: [{ category: 'CLASSIC', name: 'Classic', amount: 20000 }],
}
const seats = (states) => ok({ availability: 'OPEN', seats: states, myHold: null, serverTime: new Date().toISOString() })
const seat = (n) => screen.getByRole('button', { name: new RegExp(`^Row A seat ${n},`) })

beforeEach(() => {
  vi.clearAllMocks()
  authApi.getMe.mockResolvedValue(ok({ user: customer }))
  cinemaApi.getShowtime.mockResolvedValue(ok({ showtime }))
})

describe('live seat updates', () => {
  it('joins the show room, shows the live status and refetches after joining', async () => {
    bookingsApi.getSeatAvailability.mockResolvedValue(seats({}))
    renderApp('/showtimes/s1')
    expect(await screen.findByText('Live seat updates')).toBeInTheDocument()
    expect(fakeSocket.emitted).toContainEqual(['showtime:join', 's1'])
    // A resync requested while the first load is still pending merges into it (no wasted request).
    await waitFor(() => expect(bookingsApi.getSeatAvailability).toHaveBeenCalled())
  })

  it('marks seats taken by others immediately, then confirms with the server', async () => {
    bookingsApi.getSeatAvailability.mockResolvedValue(seats({}))
    renderApp('/showtimes/s1')
    await waitFor(() => expect(seat(2)).not.toHaveAttribute('aria-disabled'))
    const before = bookingsApi.getSeatAvailability.mock.calls.length

    bookingsApi.getSeatAvailability.mockResolvedValue(seats({ A2: 'held' }))
    act(() => fakeSocket.serverSends('seats:changed', { showtimeId: 's1', changes: [{ seatId: 'A2', state: 'held' }] }))
    expect(seat(2)).toHaveAttribute('aria-disabled', 'true') // instant
    await waitFor(() => expect(bookingsApi.getSeatAvailability.mock.calls.length).toBe(before + 1)) // authoritative refetch
    expect(seat(2)).toHaveAttribute('aria-disabled', 'true')
  })

  it('removes a seat from my selection when someone else takes it', async () => {
    bookingsApi.getSeatAvailability.mockResolvedValue(seats({}))
    renderApp('/showtimes/s1')
    await waitFor(() => expect(seat(1)).toBeInTheDocument())
    act(() => seat(1).click())
    expect(seat(1)).toHaveAttribute('aria-pressed', 'true')
    act(() => fakeSocket.serverSends('seats:changed', { showtimeId: 's1', changes: [{ seatId: 'A1', state: 'booked' }] }))
    expect(await screen.findByText(/just taken by someone else/)).toBeInTheDocument()
    expect(seat(1)).toHaveAttribute('aria-pressed', 'false')
  })

  it('ignores events for other shows', async () => {
    bookingsApi.getSeatAvailability.mockResolvedValue(seats({}))
    renderApp('/showtimes/s1')
    await waitFor(() => expect(seat(3)).toBeInTheDocument())
    act(() => fakeSocket.serverSends('seats:changed', { showtimeId: 'other', changes: [{ seatId: 'A3', state: 'booked' }] }))
    expect(seat(3)).not.toHaveAttribute('aria-disabled')
  })

  it('reloads when the show is cancelled and warns the user', async () => {
    bookingsApi.getSeatAvailability.mockResolvedValue(seats({}))
    renderApp('/showtimes/s1')
    await waitFor(() => expect(seat(1)).toBeInTheDocument())
    cinemaApi.getShowtime.mockResolvedValue(ok({ showtime: { ...showtime, availability: 'CANCELLED' } }))
    bookingsApi.getSeatAvailability.mockResolvedValue(ok({ availability: 'CANCELLED', seats: {}, myHold: null, serverTime: new Date().toISOString() }))
    act(() => fakeSocket.serverSends('showtime:cancelled', { showtimeId: 's1' }))
    expect(await screen.findByText('This show has been cancelled.')).toBeInTheDocument()
  })

  it('shows when live updates are unavailable', async () => {
    fakeSocket.joinReply = { ok: false, error: 'SERVER_ERROR' }
    bookingsApi.getSeatAvailability.mockResolvedValue(seats({}))
    renderApp('/showtimes/s1')
    expect(await screen.findByText(/Live updates paused/)).toBeInTheDocument()
  })
})

describe('personal booking updates', () => {
  it('refreshes the checkout when the server reports the hold expired', async () => {
    const held = {
      id: 'b1',
      reference: 'IMV-ABCDEFGH',
      status: 'HELD',
      showtime: 's1',
      seats: [{ seatId: 'A1', category: 'CLASSIC', categoryName: 'Classic', price: 20000 }],
      totalAmount: 20000,
      holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      snapshot: { movie: { title: 'Alpha', durationMins: 100 }, theatre: { name: 'Galaxy' }, screen: { name: 'Screen 1' }, startsAt: showtime.startsAt },
    }
    const view = (b) => ok({ booking: b, payments: [], refunds: [], cancellation: { allowed: false }, serverTime: new Date().toISOString() })
    bookingsApi.getBooking.mockResolvedValueOnce(view(held)).mockResolvedValue(view({ ...held, status: 'EXPIRED' }))
    renderApp('/bookings/b1/checkout')
    await screen.findByRole('heading', { name: 'Review and pay' })
    act(() => fakeSocket.serverSends('booking:updated', { bookingId: 'b1', status: 'EXPIRED' }))
    expect(await screen.findByRole('heading', { name: 'Your seat hold has expired' })).toBeInTheDocument()
  })
})
