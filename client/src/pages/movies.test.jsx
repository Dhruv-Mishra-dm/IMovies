import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as authApi from '../api/auth.js'
import * as moviesApi from '../api/movies.js'
import { renderApp, ok, fail } from '../test/renderApp.jsx'
import { formatDuration, formatPrice, formatTime } from '../utils/format.js'

vi.mock('../api/auth.js', () => ({ getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() }))
vi.mock('../api/movies.js', () => ({ listMovies: vi.fn(), getMovieFilters: vi.fn(), getMovie: vi.fn() }))
vi.mock('../api/cinema.js', () => {
  const ok = (data) => ({ ok: true, status: 200, kind: 'ok', data })
  return {
    listCities: vi.fn(async () => ok({ cities: [] })),
    listShowtimeDates: vi.fn(async () => ok({ dates: [] })),
    listShowtimes: vi.fn(async () => ok({ showtimes: [] })),
  }
})

const movie = (overrides = {}) => ({
  id: overrides.slug ?? 'm1',
  title: 'The Monsoon Cipher',
  slug: 'the-monsoon-cipher',
  genres: ['Thriller', 'Mystery'],
  languages: ['Hindi', 'English'],
  durationMins: 142,
  certification: 'UA 13+',
  releaseDate: '2026-01-01T00:00:00.000Z',
  posterUrl: '/posters/the-monsoon-cipher.svg',
  ...overrides,
})
const page = (items, extra = {}) => ok({ items, page: 1, pageSize: 12, total: items.length, totalPages: 1, ...extra })
const location = () => screen.getByTestId('location').textContent

beforeEach(() => {
  vi.clearAllMocks()
  authApi.getMe.mockResolvedValue(fail(401, 'AUTH_REQUIRED'))
  moviesApi.getMovieFilters.mockResolvedValue(ok({ genres: ['Drama', 'Thriller'], languages: ['English', 'Hindi'] }))
})

describe('movies page', () => {
  it('lists movies as links to their detail pages', async () => {
    moviesApi.listMovies.mockResolvedValue(page([movie(), movie({ title: 'Paper Kites', slug: 'paper-kites', genres: ['Family'] })]))
    renderApp('/movies')
    const link = await screen.findByRole('link', { name: /The Monsoon Cipher/ })
    expect(link).toHaveAttribute('href', '/movies/the-monsoon-cipher')
    expect(screen.getByText('2 movies')).toBeInTheDocument()
    expect(screen.getByAltText('Poster for Paper Kites')).toBeInTheDocument()
  })

  it('searches after the user stops typing and puts the query in the URL', async () => {
    moviesApi.listMovies.mockResolvedValue(page([movie()]))
    renderApp('/movies')
    await screen.findByText('1 movie')
    await userEvent.type(screen.getByLabelText('Search by title'), 'monsoon')
    await waitFor(() => expect(location()).toBe('/movies?q=monsoon'))
    expect(moviesApi.listMovies).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'monsoon', page: 1 }), expect.anything())
    // one request for the initial load and one for the finished word — not one per keystroke
    expect(moviesApi.listMovies).toHaveBeenCalledTimes(2)
  })

  it('applies genre and release filters from the controls and from the URL', async () => {
    moviesApi.listMovies.mockResolvedValue(page([movie()]))
    renderApp('/movies?release=coming-soon')
    await screen.findByText('1 movie')
    expect(screen.getByRole('button', { name: 'Coming soon' })).toHaveAttribute('aria-pressed', 'true')
    expect(moviesApi.listMovies).toHaveBeenCalledWith(expect.objectContaining({ release: 'coming-soon' }), expect.anything())

    await userEvent.selectOptions(screen.getByLabelText('Genre'), 'Thriller')
    await waitFor(() => expect(location()).toBe('/movies?genre=Thriller&release=coming-soon'))
  })

  it('shows an empty state with a way to clear filters', async () => {
    moviesApi.listMovies.mockResolvedValue(page([]))
    renderApp('/movies?q=zzz')
    expect(await screen.findByRole('heading', { name: 'No movies match' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(location()).toBe('/movies'))
    expect(screen.getByLabelText('Search by title')).toHaveValue('')
  })

  it('shows an error with a working retry', async () => {
    moviesApi.listMovies.mockResolvedValueOnce({ ok: false, status: 0, kind: 'unreachable', data: null }).mockResolvedValueOnce(page([movie()]))
    renderApp('/movies')
    expect(await screen.findByText(/Cannot reach the IMovies server/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('1 movie')).toBeInTheDocument()
  })

  it('paginates', async () => {
    moviesApi.listMovies.mockResolvedValue(page([movie()], { total: 30, totalPages: 3 }))
    renderApp('/movies')
    const nav = await screen.findByRole('navigation', { name: 'Movie pages' })
    expect(within(nav).getByRole('button', { name: 'Previous' })).toBeDisabled()
    await userEvent.click(within(nav).getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(location()).toBe('/movies?page=2'))
  })
})

describe('movie detail page', () => {
  it('shows the movie details', async () => {
    moviesApi.getMovie.mockResolvedValue(
      ok({ movie: { ...movie(), synopsis: 'A code-breaker races the rain.', director: 'Ira Deshpande', cast: ['Meera Kulkarni'], trailerUrl: 'https://example.com/t' } }),
    )
    renderApp('/movies/the-monsoon-cipher')
    expect(await screen.findByRole('heading', { level: 1, name: 'The Monsoon Cipher' })).toBeInTheDocument()
    expect(screen.getByText('A code-breaker races the rain.')).toBeInTheDocument()
    expect(screen.getByText('Ira Deshpande')).toBeInTheDocument()
    expect(screen.getByText('2h 22m')).toBeInTheDocument()
    const trailer = screen.getByRole('link', { name: /Watch trailer/ })
    expect(trailer).toHaveAttribute('rel', 'noopener noreferrer')
    expect(moviesApi.getMovie).toHaveBeenCalledWith('the-monsoon-cipher', expect.anything())
  })

  it('shows a friendly not-found state', async () => {
    moviesApi.getMovie.mockResolvedValue(fail(404, 'MOVIE_NOT_FOUND', 'Movie not found'))
    renderApp('/movies/unknown')
    expect(await screen.findByRole('heading', { name: 'Movie not found' })).toBeInTheDocument()
  })
})

describe('home page', () => {
  it('features a now-showing movie and lists coming-soon titles', async () => {
    moviesApi.listMovies.mockImplementation(async (params) =>
      params.release === 'now-showing' ? page([movie()]) : page([movie({ title: 'Saffron Skies', slug: 'saffron-skies', releaseDate: '2099-01-01T00:00:00Z' })]),
    )
    renderApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'The Monsoon Cipher' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Book tickets' })).toHaveAttribute('href', '/movies/the-monsoon-cipher')
    expect(await screen.findByText(/Releases/)).toBeInTheDocument()
  })
})

describe('formatting helpers', () => {
  it('formats durations, paise and IST times', () => {
    expect(formatDuration(142)).toBe('2h 22m')
    expect(formatDuration(60)).toBe('1h')
    expect(formatPrice(25000)).toBe('₹250')
    expect(formatPrice(25050)).toBe('₹250.50')
    expect(formatTime('2026-11-02T13:00:00.000Z')).toBe('6:30 PM') // 18:30 IST regardless of the test machine's zone
  })
})
