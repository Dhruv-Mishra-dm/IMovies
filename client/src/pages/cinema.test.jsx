import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as authApi from '../api/auth.js'
import * as cinemaApi from '../api/cinema.js'
import { renderApp, ok, fail } from '../test/renderApp.jsx'
import SeatMap from '../components/showtimes/SeatMap.jsx'

vi.mock('../api/auth.js', () => ({ getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() }))
vi.mock('../api/cinema.js', () => ({
  listCities: vi.fn(),
  listTheatres: vi.fn(),
  getTheatre: vi.fn(),
  listShowtimes: vi.fn(),
  listShowtimeDates: vi.fn(),
  getShowtime: vi.fn(),
}))

const layout = {
  categories: [
    { code: 'CLASSIC', name: 'Classic' },
    { code: 'RECLINER', name: 'Recliner' },
  ],
  rows: [
    { label: 'A', seats: [{ number: 1, col: 1, category: 'CLASSIC', accessible: true }, { number: 2, col: 2, category: 'CLASSIC' }, { number: 3, col: 4, category: 'CLASSIC', disabled: true }] },
    { label: 'B', seats: [{ number: 1, col: 1, category: 'RECLINER' }, { number: 2, col: 3, category: 'RECLINER' }] },
  ],
}
const prices = [
  { category: 'CLASSIC', name: 'Classic', amount: 20000 },
  { category: 'RECLINER', name: 'Recliner', amount: 45000 },
]
const show = (overrides = {}) => ({
  id: 's1',
  startsAt: '2026-11-02T13:00:00.000Z',
  language: 'Hindi',
  format: 'IMAX',
  priceFrom: 20000,
  capacity: 100,
  seatsLeft: 60,
  availability: 'OPEN',
  movie: { id: 'm1', title: 'Alpha', slug: 'alpha', certification: 'UA 13+' },
  theatre: { id: 't1', name: 'Galaxy Bandra', slug: 'galaxy-bandra', city: 'Mumbai', address: '14 Hill Road' },
  screen: { id: 'sc1', name: 'Screen 1' },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  authApi.getMe.mockResolvedValue(fail(401, 'AUTH_REQUIRED'))
  cinemaApi.listCities.mockResolvedValue(ok({ cities: ['Delhi', 'Mumbai'] }))
})

describe('seat map', () => {
  it('labels every seat with row, number, category, price, accessibility and state', () => {
    render(<SeatMap seatMap={layout} prices={prices} takenStates={{ B1: 'booked', A2: 'held' }} />)
    expect(screen.getByRole('img', { name: 'Row A seat 1, Classic, ₹200, wheelchair accessible, available' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Row A seat 2.*held by another customer/ })).toHaveClass('seat-held')
    expect(screen.getByRole('img', { name: /Row A seat 3.*not available/ })).toHaveClass('seat-unavailable')
    expect(screen.getByRole('img', { name: /Row B seat 1, Recliner, ₹450, booked/ })).toHaveClass('seat-booked')
    expect(screen.queryAllByRole('button')).toHaveLength(0) // read-only: no fake buttons
  })

  it('places seats on grid columns so aisles appear', () => {
    render(<SeatMap seatMap={layout} prices={prices} />)
    expect(screen.getByRole('img', { name: /Row A seat 3/ })).toHaveStyle({ gridColumn: '4' })
  })

  it('is one tab stop with arrow-key navigation and toggles only bookable seats', async () => {
    const onToggle = vi.fn()
    render(<SeatMap seatMap={layout} prices={prices} takenStates={{ B1: 'booked' }} selected={new Set(['A2'])} onToggle={onToggle} />)
    const seats = screen.getAllByRole('button')
    expect(seats.filter((b) => b.tabIndex === 0)).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Row A seat 2/ })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.tab()
    expect(screen.getByRole('button', { name: /Row A seat 1/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: /Row A seat 2/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onToggle).toHaveBeenCalledWith('A2')
    await userEvent.keyboard('{ArrowLeft}{ArrowDown}')
    expect(screen.getByRole('button', { name: /Row B seat 1/ })).toHaveFocus() // same grid column, next row

    await userEvent.click(screen.getByRole('button', { name: /Row B seat 1/ })) // booked
    await userEvent.click(screen.getByRole('button', { name: /Row A seat 3/ })) // out of service
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('theatre pages', () => {
  it('lists theatres and filters by city through the URL', async () => {
    cinemaApi.listTheatres.mockResolvedValue(
      ok({ theatres: [{ id: 't1', name: 'Galaxy Bandra', slug: 'galaxy-bandra', city: 'Mumbai', address: '14 Hill Road', screenCount: 2, amenities: ['Recliners'] }] }),
    )
    renderApp('/theatres')
    expect(await screen.findByRole('link', { name: 'Galaxy Bandra' })).toHaveAttribute('href', '/theatres/galaxy-bandra')
    expect(screen.getByText(/2 screens · Recliners/)).toBeInTheDocument()
    await userEvent.selectOptions(await screen.findByLabelText('City'), 'Mumbai')
    await waitFor(() => expect(cinemaApi.listTheatres).toHaveBeenLastCalledWith({ city: 'Mumbai' }, expect.anything()))
  })

  it('shows a theatre with its showtimes grouped by movie and IST times', async () => {
    cinemaApi.getTheatre.mockResolvedValue(ok({ theatre: { id: 't1', name: 'Galaxy Bandra', address: '14 Hill Road', amenities: [] }, screens: [{ id: 'sc1', name: 'Screen 1', format: 'IMAX', capacity: 120 }] }))
    cinemaApi.listShowtimeDates.mockResolvedValue(ok({ dates: ['2026-11-02', '2026-11-03'] }))
    cinemaApi.listShowtimes.mockResolvedValue(
      ok({ showtimes: [show(), show({ id: 's2', startsAt: '2026-11-02T16:00:00.000Z', seatsLeft: 0 }), show({ id: 's3', movie: { id: 'm2', title: 'Beta', slug: 'beta', certification: 'U' }, seatsLeft: 5 })] }),
    )
    renderApp('/theatres/galaxy-bandra')
    expect(await screen.findByRole('heading', { level: 1, name: 'Galaxy Bandra' })).toBeInTheDocument()
    expect(screen.getByText('Screen 1 (IMAX, 120 seats)')).toBeInTheDocument()

    const alpha = (await screen.findByRole('link', { name: 'Alpha' })).closest('.showtime-group')
    expect(within(alpha).queryByText('Beta')).not.toBeInTheDocument() // grouped by movie
    const bookable = within(alpha).getByRole('link', { name: /6:30 PM, Hindi IMAX, from ₹200/ })
    expect(bookable).toHaveAttribute('href', '/showtimes/s1')
    expect(within(alpha).getByLabelText(/9:30 PM.*Sold out/)).toHaveAttribute('aria-disabled', 'true')
    expect(within(alpha).queryByRole('link', { name: /9:30 PM/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/5 left/)).toBeInTheDocument() // filling fast hint

    await userEvent.click(screen.getByRole('button', { name: /3 Nov/ }))
    await waitFor(() => expect(cinemaApi.listShowtimes).toHaveBeenLastCalledWith({ theatre: 't1', date: '2026-11-03' }, expect.anything()))
  })

  it('shows an empty state when nothing is scheduled', async () => {
    cinemaApi.getTheatre.mockResolvedValue(ok({ theatre: { id: 't1', name: 'Quiet Hall', address: 'x', amenities: [] }, screens: [] }))
    cinemaApi.listShowtimeDates.mockResolvedValue(ok({ dates: [] }))
    renderApp('/theatres/quiet-hall')
    expect(await screen.findByRole('heading', { name: 'No upcoming shows' })).toBeInTheDocument()
  })
})

describe('showtime page', () => {
  it('shows show details, prices and a read-only seat map', async () => {
    cinemaApi.getShowtime.mockResolvedValue(ok({ showtime: { ...show(), seatMap: layout, prices } }))
    renderApp('/showtimes/s1')
    expect(await screen.findByRole('heading', { level: 1, name: /2 Nov, 6:30 PM/ })).toBeInTheDocument()
    expect(screen.getByText('₹450')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Seat map' })).toBeInTheDocument()
  })

  it('warns when a show is cancelled', async () => {
    cinemaApi.getShowtime.mockResolvedValue(ok({ showtime: { ...show({ availability: 'CANCELLED' }), seatMap: layout, prices } }))
    renderApp('/showtimes/s1')
    expect(await screen.findByText('This show has been cancelled.')).toBeInTheDocument()
  })
})
