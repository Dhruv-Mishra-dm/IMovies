import { Link, useParams } from 'react-router-dom'
import { getShowtime } from '../api/cinema.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import SeatMap from '../components/showtimes/SeatMap.jsx'
import Button from '../components/ui/Button.jsx'
import Alert from '../components/ui/Alert.jsx'
import { PageLoader, ErrorState, EmptyState } from '../components/ui/Feedback.jsx'
import { formatDateTime, formatPrice } from '../utils/format.js'

const CLOSED_MESSAGES = {
  CANCELLED: 'This show has been cancelled.',
  STARTED: 'This show has already started, so booking is closed.',
  COMPLETED: 'This show has finished.',
}

export default function ShowtimePage() {
  const { id } = useParams()
  const { result, reload } = useApiResource((signal) => getShowtime(id, signal), id)

  if (!result) return <PageLoader label="Loading seats…" />
  if (!result.ok) {
    return (
      <div className="container page">
        {result.status === 404 || result.status === 400 ? (
          <EmptyState title="Showtime not found" action={<Button to="/movies">Browse movies</Button>}>
            This showtime doesn&apos;t exist.
          </EmptyState>
        ) : (
          <ErrorState message={errorMessage(result)} onRetry={reload} />
        )}
      </div>
    )
  }

  const { showtime } = result.data
  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <p className="hero-eyebrow">
            <Link to={`/movies/${showtime.movie.slug}`}>{showtime.movie.title}</Link>
          </p>
          <h1>{formatDateTime(showtime.startsAt)}</h1>
          <p className="muted">
            {showtime.theatre.name} · {showtime.screen.name} · {showtime.language} · {showtime.format} · {showtime.movie.certification}
          </p>
        </div>
      </div>
      {CLOSED_MESSAGES[showtime.availability] && <Alert type="warning">{CLOSED_MESSAGES[showtime.availability]}</Alert>}
      <ul className="price-list muted" aria-label="Prices">
        {showtime.prices.map((p) => (
          <li key={p.category}>
            {p.name}: <strong>{formatPrice(p.amount)}</strong>
          </li>
        ))}
        <li>{showtime.seatsLeft} seats left</li>
      </ul>
      <div style={{ marginTop: 'var(--space-5)' }}>
        <SeatMap seatMap={showtime.seatMap} prices={showtime.prices} />
      </div>
    </div>
  )
}
