import { Link } from 'react-router-dom'
import MoviePoster from './MoviePoster.jsx'
import { formatDuration, formatLongDate } from '../../utils/format.js'
import { isComingSoon } from '../../utils/movies.js'

/** A movie in a grid: the whole card is one link (one tab stop) to the detail page. */
export default function MovieCard({ movie }) {
  const comingSoon = isComingSoon(movie)
  return (
    <li className="movie-card">
      <Link to={`/movies/${movie.slug}`} className="movie-card-link">
        <div className="movie-card-poster">
          <MoviePoster movie={movie} />
          <span className="badge cert-badge" title="Certificate">
            {movie.certification}
          </span>
        </div>
        <div className="movie-card-body">
          <h3 className="movie-card-title">{movie.title}</h3>
          <p className="movie-card-meta">
            {comingSoon ? `Releases ${formatLongDate(movie.releaseDate)}` : `${formatDuration(movie.durationMins)} · ${movie.genres.join(', ')}`}
          </p>
          <p className="movie-card-meta faint">{movie.languages.join(' · ')}</p>
        </div>
      </Link>
    </li>
  )
}
