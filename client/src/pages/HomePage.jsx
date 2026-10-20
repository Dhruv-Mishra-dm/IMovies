import { Link } from 'react-router-dom'
import { listMovies } from '../api/movies.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import MovieCard from '../components/movies/MovieCard.jsx'
import MoviePoster from '../components/movies/MoviePoster.jsx'
import Button from '../components/ui/Button.jsx'
import { PageLoader, ErrorState } from '../components/ui/Feedback.jsx'
import { formatDuration } from '../utils/format.js'

function MovieRow({ title, link, result, reload, emptyText }) {
  return (
    <section className="section" aria-labelledby={`${link.replace(/\W/g, '')}-heading`}>
      <div className="section-header">
        <h2 id={`${link.replace(/\W/g, '')}-heading`}>{title}</h2>
        <Link to={link}>See all</Link>
      </div>
      {!result && <PageLoader />}
      {result && !result.ok && <ErrorState message={errorMessage(result)} onRetry={reload} />}
      {result?.ok &&
        (result.data.items.length ? (
          <ul className="movie-grid">
            {result.data.items.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </ul>
        ) : (
          <p className="muted">{emptyText}</p>
        ))}
    </section>
  )
}

export default function HomePage() {
  const nowShowing = useApiResource((signal) => listMovies({ release: 'now-showing', pageSize: 8 }, signal), 'now')
  const comingSoon = useApiResource((signal) => listMovies({ release: 'coming-soon', sort: 'release-asc', pageSize: 4 }, signal), 'soon')
  const featured = nowShowing.result?.ok ? nowShowing.result.data.items[0] : null

  return (
    <>
      <section
        className="hero"
        aria-labelledby="hero-heading"
        style={featured?.backdropUrl ? { backgroundImage: `url("${featured.backdropUrl}")` } : undefined}
      >
        <div className="container">
          <div>
            <p className="hero-eyebrow">{featured ? 'Now showing' : 'IMovies'}</p>
            <h1 id="hero-heading">{featured ? featured.title : 'Your next film starts here'}</h1>
            <p className="hero-synopsis">
              {featured
                ? `${featured.genres.join(' · ')} · ${formatDuration(featured.durationMins)} · ${featured.certification}. Pick your seats and book in under a minute.`
                : 'Browse what’s showing, pick the exact seats you want and book in under a minute.'}
            </p>
            <div className="cluster">
              {featured && (
                <Button to={`/movies/${featured.slug}`} variant="primary">
                  Book tickets
                </Button>
              )}
              <Button to="/movies">Browse all movies</Button>
            </div>
          </div>
          {featured && (
            <div className="hero-poster">
              <MoviePoster movie={featured} eager />
            </div>
          )}
        </div>
      </section>

      <div className="container page" style={{ paddingTop: 0 }}>
        <MovieRow
          title="Now showing"
          link="/movies?release=now-showing"
          result={nowShowing.result}
          reload={nowShowing.reload}
          emptyText="No movies are showing right now. Check back soon."
        />
        <MovieRow
          title="Coming soon"
          link="/movies?release=coming-soon"
          result={comingSoon.result}
          reload={comingSoon.reload}
          emptyText="No upcoming releases have been announced yet."
        />
      </div>
    </>
  )
}
