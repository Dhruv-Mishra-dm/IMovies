import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as authApi from '../../api/auth.js'
import * as adminApi from '../../api/admin.js'
import { renderApp, ok, fail, customer, admin } from '../../test/renderApp.jsx'
import { buildLayout, describeLayout, parseNumberList, rupeesToPaise, paiseToRupees } from '../../utils/seatLayout.js'

vi.mock('../../api/auth.js', () => ({ getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() }))
vi.mock('../../api/admin.js', () => ({
  getStats: vi.fn(),
  listMovies: vi.fn(),
  getMovie: vi.fn(),
  createMovie: vi.fn(),
  updateMovie: vi.fn(),
  publishMovie: vi.fn(),
  archiveMovie: vi.fn(),
  deleteMovie: vi.fn(),
  listTheatres: vi.fn(),
  getTheatre: vi.fn(),
  createTheatre: vi.fn(),
  updateTheatre: vi.fn(),
  createScreen: vi.fn(),
  getScreen: vi.fn(),
  updateScreen: vi.fn(),
  listShowtimes: vi.fn(),
  createShowtime: vi.fn(),
  updateShowtime: vi.fn(),
  cancelShowtime: vi.fn(),
  listBookings: vi.fn(),
  getBooking: vi.fn(),
}))

const location = () => screen.getByTestId('location').textContent
const asAdmin = () => authApi.getMe.mockResolvedValue(ok({ user: admin }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('admin access', () => {
  it('blocks customers from the admin area (the API also refuses them)', async () => {
    authApi.getMe.mockResolvedValue(ok({ user: customer }))
    renderApp('/admin')
    expect(await screen.findByRole('heading', { name: 'Administrators only' })).toBeInTheDocument()
    expect(adminApi.getStats).not.toHaveBeenCalled()
  })
})

describe('dashboard', () => {
  it('shows statistics computed by the server', async () => {
    asAdmin()
    adminApi.getStats.mockResolvedValue(
      ok({
        generatedAt: '2099-01-01T00:00:00Z',
        periodDays: 30,
        catalogue: { moviesPublished: 10, theatresActive: 4, upcomingShows: 168 },
        revenue: { gross: 105000, refunded: 20000, net: 85000, payments: 3, refunds: 1 },
        sales: { bookings: 2, tickets: 3 },
        occupancy: { windowDays: 7, bookedSeats: 3, capacity: 30, rate: 0.1 },
        topMovies: [{ movieId: 'm1', title: 'Alpha', tickets: 3, revenue: 85000 }],
        recentBookings: [{ id: 'b1', reference: 'IMV-ABCDEFGH', status: 'CONFIRMED', totalAmount: 40000, user: { name: 'Asha' } }],
      }),
    )
    renderApp('/admin')
    const netTile = (await screen.findByText('Net revenue')).closest('.stat')
    expect(within(netTile).getByText('₹850')).toBeInTheDocument()
    expect(screen.getByText('₹1,050 paid − ₹200 refunded')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'IMV-ABCDEFGH' })).toHaveAttribute('href', '/admin/bookings/b1')
  })
})

describe('movie management', () => {
  const movie = { id: 'm1', title: 'Untitled', genres: ['Crime'], releaseDate: '2099-01-01T00:00:00Z', status: 'DRAFT' }

  it('publishes a draft only after confirmation', async () => {
    asAdmin()
    adminApi.listMovies.mockResolvedValue(ok({ items: [movie], page: 1, totalPages: 1 }))
    adminApi.publishMovie.mockResolvedValue(ok({ movie: { ...movie, status: 'PUBLISHED' } }))
    renderApp('/admin/movies')
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    expect(adminApi.publishMovie).not.toHaveBeenCalled()
    const dialog = screen.getByRole('heading', { name: /Publish “Untitled”/ }).closest('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))
    expect(adminApi.publishMovie).toHaveBeenCalledWith('m1')
  })

  it('validates the movie form and shows server field errors', async () => {
    asAdmin()
    adminApi.createMovie.mockResolvedValue(fail(400, 'VALIDATION_ERROR', 'Request validation failed', [{ path: 'posterUrl', message: 'must be an https:// URL or a /path on this site' }]))
    renderApp('/admin/movies/new')
    await userEvent.click(await screen.findByRole('button', { name: 'Create draft' }))
    expect(screen.getByText('Enter a title')).toBeInTheDocument()
    expect(screen.getByText('Choose 1 to 5 genres')).toBeInTheDocument()
    expect(adminApi.createMovie).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Title'), 'New Film')
    await userEvent.click(screen.getByLabelText('Drama'))
    await userEvent.type(screen.getByLabelText(/^Languages/), 'Hindi, English')
    await userEvent.type(screen.getByLabelText('Duration (minutes)'), '125')
    await userEvent.type(screen.getByLabelText('Release date (IST)'), '2099-12-25')
    await userEvent.type(screen.getByLabelText(/^Poster URL/), 'http://bad')
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(adminApi.createMovie).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Film', genres: ['Drama'], languages: ['Hindi', 'English'], durationMins: 125, releaseDate: '2099-12-25' }))
    expect(await screen.findByText(/This field must be an https/)).toBeInTheDocument()
  })
})

describe('showtimes', () => {
  const show = {
    id: 's1',
    startsAt: '2099-11-02T13:00:00.000Z',
    language: 'Hindi',
    format: '2D',
    status: 'SCHEDULED',
    availability: 'OPEN',
    priceFrom: 20000,
    capacity: 100,
    seatsLeft: 90,
    movie: { title: 'Alpha' },
    theatre: { name: 'Galaxy' },
    screen: { name: 'Screen 1' },
    prices: [{ category: 'CLASSIC', amount: 20000 }],
  }

  it('cancels a show with a required reason and reports the outcome', async () => {
    asAdmin()
    adminApi.listTheatres.mockResolvedValue(ok({ theatres: [] }))
    adminApi.listShowtimes.mockResolvedValue(ok({ items: [show], page: 1, totalPages: 1 }))
    adminApi.cancelShowtime.mockResolvedValue(ok({ showtime: { status: 'CANCELLED', cancellation: { progress: 'COMPLETED', bookingsCancelled: 2, refundsRecorded: 1 } } }))
    renderApp('/admin/showtimes')
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    const dialog = screen.getByRole('heading', { name: 'Cancel this show?' }).closest('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel show' }))
    expect(within(dialog).getByText(/Give a short reason/)).toBeInTheDocument()
    expect(adminApi.cancelShowtime).not.toHaveBeenCalled()
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Projector failure')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel show' }))
    expect(adminApi.cancelShowtime).toHaveBeenCalledWith('s1', 'Projector failure')
    expect(await screen.findByText(/2 booking\(s\) cancelled, 1 refund\(s\) recorded/)).toBeInTheDocument()
  })

  it('edits prices in rupees and sends paise', async () => {
    asAdmin()
    adminApi.listTheatres.mockResolvedValue(ok({ theatres: [] }))
    adminApi.listShowtimes.mockResolvedValue(ok({ items: [show], page: 1, totalPages: 1 }))
    adminApi.updateShowtime.mockResolvedValue(ok({ showtime: show }))
    renderApp('/admin/showtimes')
    await userEvent.click(await screen.findByRole('button', { name: 'Prices' }))
    const input = screen.getByLabelText('CLASSIC (₹)')
    expect(input).toHaveValue('200')
    await userEvent.clear(input)
    await userEvent.type(input, '250.50')
    await userEvent.click(screen.getByRole('button', { name: 'Save prices' }))
    expect(adminApi.updateShowtime).toHaveBeenCalledWith('s1', { prices: [{ category: 'CLASSIC', amount: 25050 }] })
  })
})

describe('bookings lookup', () => {
  it('searches and links to the detail', async () => {
    asAdmin()
    adminApi.listBookings.mockResolvedValue(
      ok({
        items: [{ id: 'b1', reference: 'IMV-ABCDEFGH', status: 'CANCELLED', totalAmount: 20000, seats: [{ seatId: 'A1' }], user: { name: 'Asha', email: 'asha@example.test' }, snapshot: { movie: { title: 'Alpha' }, startsAt: '2099-11-02T13:00:00Z' } }],
        page: 1,
        totalPages: 1,
      }),
    )
    renderApp('/admin/bookings')
    await userEvent.type(await screen.findByLabelText(/Reference, customer email or name/), 'asha')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(location()).toBe('/admin/bookings?q=asha'))
    expect(adminApi.listBookings).toHaveBeenLastCalledWith({ q: 'asha', page: 1 }, expect.anything())
    expect(screen.getByRole('link', { name: 'IMV-ABCDEFGH' })).toHaveAttribute('href', '/admin/bookings/b1')
  })
})

describe('seat layout helpers', () => {
  it('builds rows with aisles and round-trips an existing layout', () => {
    const rows = [{ label: 'A', category: 'CLASSIC', seats: 6, offset: 1, aisleAfter: [3], accessible: [1], disabled: [6] }]
    const layout = buildLayout({ categories: [{ code: 'CLASSIC', name: 'Classic' }], rows })
    expect(layout.rows[0].seats.map((s) => s.col)).toEqual([2, 3, 4, 6, 7, 8])
    expect(describeLayout(layout)).toEqual([{ label: 'A', category: 'CLASSIC', seats: 6, offset: 1, aisleAfter: [3], accessible: [1], disabled: [6] }])
  })

  it('parses number lists and money safely', () => {
    expect(parseNumberList('3, 11 x, -2')).toEqual([3, 11])
    expect(rupeesToPaise('250')).toBe(25000)
    expect(rupeesToPaise('250.5')).toBe(25050)
    expect(rupeesToPaise('250.555')).toBeNull()
    expect(rupeesToPaise('-1')).toBeNull()
    expect(paiseToRupees(25050)).toBe('250.50')
    expect(paiseToRupees(25000)).toBe('250')
  })
})
