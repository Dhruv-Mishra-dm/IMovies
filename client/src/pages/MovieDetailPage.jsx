import { useParams } from 'react-router-dom'
import { getMovie } from '../api/movies.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import MoviePoster from '../components/movies/MoviePoster.jsx'
import Button from '../components/ui/Button.jsx'
import { PageLoader, EmptyState, ErrorState } from '../components/ui/Feedback.jsx'
import { formatDuration, formatLongDate } from '../utils/format.js'
import { isComingSoon } from '../utils/movies.js'

export default function MovieDetailPage() {
  const { slug } = useParams()
  const { result, reload } = useApiResource((signal) => getMovie(slug, signal), slug)

  if (!result) return <PageLoader label="Loading movie…" />
  if (!result.ok && result.status === 404) {
    return (
      <div className="container page">
        <EmptyState title="Movie not found" action={<Button to="/movies">Browse all movies</Button>}>
          This movie isn&apos;t in our catalogue, or it&apos;s no longer showing.
        </EmptyState>
      </div>
    )
  }
  if (!result.ok) {
    return (
      <div className="container page">
        <ErrorState message={errorMessage(result)} onRetry={reload} />
      </div>
    )
  }

  const { movie } = result.data
  const comingSoon = isComingSoon(movie)
  return (
    <article>
      <header className="hero movie-hero" style={movie.backdropUrl ? { backgroundImage: `url("${movie.backdropUrl}")` } : undefined}>
        <div className="container">
          <div className="hero-poster">
            <MoviePoster movie={movie} eager />
          </div>
          <div>
            {comingSoon && <p className="hero-eyebrow">Coming {formatLongDate(movie.releaseDate)}</p>}
            <h1>{movie.title}</h1>
            <div className="movie-facts">
              <span className="badge">{movie.certification}</span>
              <span>{formatDuration(movie.durationMins)}</span>
              <span>{movie.genres.join(' · ')}</span>
              {!comingSoon && <span>Released {formatLongDate(movie.releaseDate)}</span>}
            </div>
            <ul className="chip-list" aria-label="Languages">
              {movie.languages.map((language) => (
                <li key={language} className="chip">
                  {language}
                </li>
              ))}
            </ul>
            {movie.trailerUrl && (
              // External link: noopener/noreferrer stop the new tab from controlling or tracking this page.
              <a className="btn" href={movie.trailerUrl} target="_blank" rel="noopener noreferrer">
                Watch trailer <span className="visually-hidden">(opens in a new tab)</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="container page">
        <div className="grid-2">
          <section aria-labelledby="synopsis-heading">
            <h2 id="synopsis-heading">Synopsis</h2>
            <p className="muted">{movie.synopsis || 'Synopsis coming soon.'}</p>
          </section>
          <section aria-labelledby="credits-heading">
            <h2 id="credits-heading">Credits</h2>
            <dl className="details-list">
              <dt>Director</dt>
              <dd>{movie.director || 'To be announced'}</dd>
              <dt>Cast</dt>
              <dd>{movie.cast.length ? movie.cast.join(', ') : 'To be announced'}</dd>
            </dl>
          </section>
        </div>
      </div>
    </article>
  )
}
