import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listMovies, getMovieFilters } from '../api/movies.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import MovieCard from '../components/movies/MovieCard.jsx'
import FormField from '../components/ui/FormField.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import Button from '../components/ui/Button.jsx'
import { PageLoader, EmptyState, ErrorState } from '../components/ui/Feedback.jsx'

const RELEASE_OPTIONS = [
  ['all', 'All movies'],
  ['now-showing', 'Now showing'],
  ['coming-soon', 'Coming soon'],
]
const SORT_OPTIONS = [
  ['release-desc', 'Newest first'],
  ['release-asc', 'Oldest first'],
  ['title', 'Title A–Z'],
]
const PAGE_SIZE = 12

/** Reads the filters from the URL so every result page can be shared, bookmarked and reached with Back. */
function readParams(params) {
  return {
    q: params.get('q') ?? '',
    genre: params.get('genre') ?? '',
    language: params.get('language') ?? '',
    release: params.get('release') ?? 'all',
    sort: params.get('sort') ?? 'release-desc',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
}

export default function MoviesPage() {
  const [params, setParams] = useSearchParams()
  const filters = readParams(params)
  const [searchText, setSearchText] = useState(filters.q)
  const [syncedQ, setSyncedQ] = useState(filters.q)

  // If the URL's search changes from outside the box (Back button, "Clear filters"), show it in the box.
  // (Adjusting state during render is React's recommended pattern for this.)
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q)
    setSearchText(filters.q)
  }

  // Debounce typing: update the URL (and therefore the request) 300 ms after the user stops typing.
  useEffect(() => {
    if (searchText.trim() === filters.q) return undefined
    const timer = setTimeout(() => updateFilters({ q: searchText.trim() }), 300)
    return () => clearTimeout(timer)
  })

  function updateFilters(changes) {
    const next = { ...filters, ...changes, page: changes.page ?? 1 }
    const clean = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => value && !(key === 'release' && value === 'all') && !(key === 'sort' && value === 'release-desc') && !(key === 'page' && value === 1)),
    )
    setParams(clean, { replace: 'q' in changes })
  }

  const query = {
    ...(filters.q && { q: filters.q }),
    ...(filters.genre && { genre: filters.genre }),
    ...(filters.language && { language: filters.language }),
    release: filters.release,
    sort: filters.sort,
    page: filters.page,
    pageSize: PAGE_SIZE,
  }
  const movies = useApiResource((signal) => listMovies(query, signal), JSON.stringify(query))
  const options = useApiResource((signal) => getMovieFilters(signal), 'filters')
  const genres = options.result?.ok ? options.result.data.genres : []
  const languages = options.result?.ok ? options.result.data.languages : []

  const shown = movies.result ?? movies.previous // keep old results visible while new ones load
  const hasFilters = filters.q || filters.genre || filters.language || filters.release !== 'all'

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <h1>Movies</h1>
          <p className="muted">Search the catalogue, then pick a movie to see showtimes.</p>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="Release status">
        {RELEASE_OPTIONS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filters.release === value} onClick={() => updateFilters({ release: value })}>
            {label}
          </button>
        ))}
      </div>

      <form className="toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Search by title">
          <input className="input" type="search" placeholder="e.g. Monsoon" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </FormField>
        <FormField label="Genre">
          <select className="select" value={filters.genre} onChange={(e) => updateFilters({ genre: e.target.value })}>
            <option value="">All genres</option>
            {genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Language">
          <select className="select" value={filters.language} onChange={(e) => updateFilters({ language: e.target.value })}>
            <option value="">All languages</option>
            {languages.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Sort by">
          <select className="select" value={filters.sort} onChange={(e) => updateFilters({ sort: e.target.value })}>
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
      </form>

      {!shown && <PageLoader label="Loading movies…" />}
      {shown && !shown.ok && <ErrorState message={errorMessage(shown)} onRetry={movies.reload} />}
      {shown?.ok && (
        <div className={movies.loading ? 'is-refreshing' : undefined} aria-busy={movies.loading}>
          <p className="result-summary" role="status">
            {shown.data.total === 1 ? '1 movie' : `${shown.data.total} movies`}
            {filters.q && ` matching “${filters.q}”`}
          </p>
          {shown.data.items.length === 0 ? (
            <EmptyState
              title="No movies match"
              action={
                hasFilters && (
                  <Button
                    onClick={() => {
                      setSearchText('')
                      setParams({})
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
            >
              Try a different title, genre or language.
            </EmptyState>
          ) : (
            <ul className="movie-grid">
              {shown.data.items.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </ul>
          )}
          <Pagination page={shown.data.page} totalPages={shown.data.totalPages} onChange={(page) => updateFilters({ page })} label="Movie pages" />
        </div>
      )}
    </div>
  )
}
