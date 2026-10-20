import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as authApi from '../api/auth.js'
import * as cinemaApi from '../api/cinema.js'
import * as bookingsApi from '../api/bookings.js'
import { renderApp, ok, fail, customer } from '../test/renderApp.jsx'
import HoldCountdown from '../components/bookings/HoldCountdown.jsx'

vi.mock('../api/auth.js', () => ({ getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() }))
vi.mock('../api/cinema.js', () => ({ getShowtime: vi.fn(), listCities: vi.fn(), listShowtimeDates: vi.fn(), listShowtimes: vi.fn() }))
vi.mock('../api/bookings.js', () => ({ getSeatAvailability: vi.fn(), createBooking: vi.fn(), getBooking: vi.fn(), releaseBooking: vi.fn() }))

const seatMap = {
  categories: [
    { code: 'CLASSIC', name: 'Classic' },
    { code: 'RECLINER', name: 'Recliner' },
  ],
  rows: [
    { label: 'A', seats: [1, 2, 3, 4].map((n) => ({ number: n, col: n, category: 'CLASSIC' })) },
    { label: 'B', seats: [1, 2].map((n) => ({ number: n, col: n, category: 'RECLINER' })) },
  ],
}
const showtime = {
  id: 's1',
  startsAt: '2026-11-02T13:00:00.000Z',
  language: 'Hindi',
  format: 'IMAX',
  availability: 'OPEN',
  movie: { id: 'm1', title: 'Alpha', slug: 'alpha', certification: 'UA 13+' },
  theatre: { id: 't1', name: 'Galaxy Bandra' },
  screen: { id: 'sc1', name: 'Screen 1' },
  seatMap,
  prices: [
    { category: 'CLASSIC', name: 'Classic', amount: 20000 },
    { category: 'RECLINER', name: 'Recliner', amount: 45000 },
  ],
}
const availability = (seats = {}, myHold = null) => ok({ showtimeId: 's1', availability: 'OPEN', seats, myHold, serverTime: new Date().toISOString() })
const heldBooking = (overrides = {}) => ({
  id: 'b1',
  reference: 'IMV-ABCDEFGH',
  status: 'HELD',
  showtime: 's1',
  seats: [{ seatId: 'A1', category: 'CLASSIC', categoryName: 'Classic', price: 20000 }],
  totalAmount: 20000,
  holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  snapshot: {
    movie: { title: 'Alpha', certification: 'UA 13+', durationMins: 120, posterUrl: '' },
    theatre: { name: 'Galaxy Bandra' },
    screen: { name: 'Screen 1', format: 'IMAX' },
    language: 'Hindi',
    startsAt: '2026-11-02T13:00:00.000Z',
  },
  ...overrides,
})
const seat = (name) => screen.getByRole('button', { name: new RegExp(`^Row ${name.slice(0, 1)} seat ${name.slice(1)},`) })
const location = () => screen.getByTestId('location').textContent

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  authApi.getMe.mockResolvedValue(ok({ user: customer }))
  cinemaApi.getShowtime.mockResolvedValue(ok({ showtime }))
})

describe('seat selection', () => {
  it('selects seats, shows an indicative total and holds them on Continue', async () => {
    bookingsApi.getSeatAvailability.mockResolvedValue(availability({ A3: 'booked', A4: 'held' }))
    bookingsApi.createBooking.mockResolvedValue(ok({ booking: heldBooking(), serverTime: new Date().toISOString() }, 201))
    bookingsApi.getBooking.mockResolvedValue(ok({ booking: heldBooking(), serverTime: new Date().toISOString() }))
    renderApp('/showtimes/s1')
    await waitFor(() => expect(seat('A1')).toBeInTheDocument())
    expect(seat('A3')).toHaveAttribute('aria-disabled', 'true')
    expect(bookingsApi.getSeatAvailability).toHaveBeenCalledTimes(1) // waited for the login status: one request

    await userEvent.click(seat('A1'))
    await userEvent.click(seat('B2'))
    await userEvent.click(seat('A3')) // booked: ignored
    const bar = screen.getByRole('region', { name: 'Your selection' })
    expect(bar).toHaveTextContent('2 seats')
    expect(bar).toHaveTextContent('A1, B2')
    expect(bar).toHaveTextContent('₹650')

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(bookingsApi.createBooking).toHaveBeenCalledWith({ showtimeId: 's1', seatIds: ['A1', 'B2'] })
    await waitFor(() => expect(location()).toBe('/bookings/b1/checkout'))
  })

  it('deselects a seat when clicked again', async () => {
    bookingsApi.getSeatAvailability.mockResolvedValue(availability())
    renderApp('/showtimes/s1')
    await waitFor(() => expect(seat('A1')).toBeInTheDocument())
    await userEvent.click(seat('A1'))
    expect(seat('A1')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(seat('A1'))
    expect(seat('A1')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: 'Your selection' })).not.toBeInTheDocument()
  })

  it('explains and drops seats that were taken by someone else at the last moment', async () => {
    bookingsApi.getSeatAvailability.mockResolvedValueOnce(availability()).mockResolvedValue(availability({ A2: 'held' }))
    bookingsApi.createBooking.mockResolvedValue(fail(409, 'SEATS_UNAVAILABLE', 'taken', { seats: ['A2'] }))
    renderApp('/showtimes/s1')
    await waitFor(() => expect(seat('A1')).toBeInTheDocument())
    await userEvent.click(seat('A1'))
    await userEvent.click(seat('A2'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/A2 was just taken by someone else/)).toBeInTheDocument()
    expect(seat('A1')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(seat('A2')).toHaveAttribute('aria-disabled', 'true'))
  })

  it('sends visitors to log in and keeps their selection for when they come back', async () => {
    authApi.getMe.mockResolvedValue(fail(401, 'AUTH_REQUIRED'))
    bookingsApi.getSeatAvailability.mockResolvedValue(availability())
    renderApp('/showtimes/s1')
    await waitFor(() => expect(seat('A1')).toBeInTheDocument())
    await userEvent.click(seat('A1'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(location()).toBe('/login?next=%2Fshowtimes%2Fs1'))
    expect(bookingsApi.createBooking).not.toHaveBeenCalled()
    expect(JSON.parse(sessionStorage.getItem('imovies:selection:s1'))).toEqual(['A1'])
  })

  it('offers to continue or release an existing hold instead of selecting again', async () => {
    bookingsApi.getSeatAvailability.mockResolvedValueOnce(availability({ A1: 'mine' }, { id: 'b1', seats: [{ seatId: 'A1' }] })).mockResolvedValue(availability())
    bookingsApi.releaseBooking.mockResolvedValue(ok({ booking: heldBooking({ status: 'RELEASED' }) }))
    renderApp('/showtimes/s1')
    expect(await screen.findByText("You're holding A1")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue to payment' })).toHaveAttribute('href', '/bookings/b1/checkout')
    expect(screen.queryAllByRole('button', { name: /^Row/ })).toHaveLength(0) // map is read-only while holding
    await userEvent.click(screen.getByRole('button', { name: 'Release and choose again' }))
    await waitFor(() => expect(seat('A1')).toBeInTheDocument())
  })

  it('limits a booking to 10 seats', async () => {
    const wide = { ...showtime, seatMap: { ...seatMap, rows: [{ label: 'A', seats: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, col: i + 1, category: 'CLASSIC' })) }] } }
    cinemaApi.getShowtime.mockResolvedValue(ok({ showtime: { ...wide, seatMap: { ...wide.seatMap, categories: [seatMap.categories[0]] } } }))
    bookingsApi.getSeatAvailability.mockResolvedValue(availability())
    renderApp('/showtimes/s1')
    await waitFor(() => expect(seat('A1')).toBeInTheDocument())
    for (let n = 1; n <= 11; n += 1) await userEvent.click(seat(`A${n}`))
    expect(screen.getByRole('region', { name: 'Your selection' })).toHaveTextContent('10 seats')
    expect(seat('A11')).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('checkout', () => {
  it('shows the server-priced summary and a countdown', async () => {
    bookingsApi.getBooking.mockResolvedValue(ok({ booking: heldBooking(), payments: [], refunds: [], serverTime: new Date().toISOString() }))
    renderApp('/bookings/b1/checkout')
    expect(await screen.findByRole('heading', { name: 'Review and pay' })).toBeInTheDocument()
    expect(screen.getByText('IMV-ABCDEFGH')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Seats and prices' })).toHaveTextContent('A1')
    expect(screen.getByText('left to pay')).toBeInTheDocument()
  })

  it('explains an expired hold and links back to the seat map', async () => {
    bookingsApi.getBooking.mockResolvedValue(ok({ booking: heldBooking({ status: 'EXPIRED' }), serverTime: new Date().toISOString() }))
    renderApp('/bookings/b1/checkout')
    expect(await screen.findByRole('heading', { name: 'Your seat hold has expired' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose seats again' })).toHaveAttribute('href', '/showtimes/s1')
  })

  it('shows 404 for bookings of other customers', async () => {
    bookingsApi.getBooking.mockResolvedValue(fail(404, 'BOOKING_NOT_FOUND'))
    renderApp('/bookings/x/checkout')
    expect(await screen.findByRole('heading', { name: 'Booking not found' })).toBeInTheDocument()
  })
})

describe('hold countdown', () => {
  afterEach(() => vi.useRealTimers())

  it("counts down using the server's clock and reports expiry once", async () => {
    vi.useFakeTimers()
    const onExpire = vi.fn()
    // The visitor's clock is 1 hour fast; the server says only 1 minute is left.
    const serverNow = Date.now() - 60 * 60_000
    render(<HoldCountdown expiresAt={new Date(serverNow + 60_000).toISOString()} serverTime={new Date(serverNow).toISOString()} onExpire={onExpire} />)
    expect(screen.getByText('1:00')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(30_000))
    expect(screen.getByText('0:30')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(31_000))
    expect(screen.getByText('Hold expired')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(5_000))
    expect(onExpire).toHaveBeenCalledTimes(1)
  })
})
