import { Link, useSearchParams } from 'react-router-dom'
import { listMyBookings } from '../api/bookings.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import MoviePoster from '../components/movies/MoviePoster.jsx'
import Button from '../components/ui/Button.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { PageLoader, ErrorState, EmptyState } from '../components/ui/Feedback.jsx'
import { formatDateTime, formatPrice } from '../utils/format.js'
import { BOOKING_STATUS } from '../utils/bookingStatus.js'

const TABS = [
  ['upcoming', 'Upcoming'],
  ['past', 'Past & cancelled'],
]

function BookingCard({ booking }) {
  const link = booking.status === 'HELD' ? `/bookings/${booking.id}/checkout` : `/bookings/${booking.id}`
  return (
    <li className="card booking-card">
      <div className="booking-card-poster">
        <MoviePoster movie={{ title: booking.snapshot.movie.title, posterUrl: booking.snapshot.movie.posterUrl }} />
      </div>
      <div className="booking-card-body">
        <h2>
          <Link to={link}>{booking.snapshot.movie.title}</Link>
        </h2>
        <p className="muted">
          {formatDateTime(booking.snapshot.startsAt)} · {booking.snapshot.theatre.name}, {booking.snapshot.screen.name}
        </p>
        <p className="muted">
          Seats {booking.seats.map((s) => s.seatId).join(', ')} · {formatPrice(booking.totalAmount)} · <span className="faint">{booking.reference}</span>
        </p>
        <StatusBadge status={booking.status} map={BOOKING_STATUS} />
      </div>
    </li>
  )
}

export default function MyBookingsPage() {
  const [params, setParams] = useSearchParams()
  const scope = params.get('scope') === 'past' ? 'past' : 'upcoming'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const { result, reload } = useApiResource((signal) => listMyBookings({ scope, page }, signal), `${scope}:${page}`)

  return (
    <div className="container page">
      <div className="page-header">
        <h1>My bookings</h1>
      </div>
      <div className="segmented" role="group" aria-label="Which bookings">
        {TABS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={scope === value} onClick={() => setParams(value === 'upcoming' ? {} : { scope: value })}>
            {label}
          </button>
        ))}
      </div>
      {!result && <PageLoader label="Loading your bookings…" />}
      {result && !result.ok && <ErrorState message={errorMessage(result)} onRetry={reload} />}
      {result?.ok &&
        (result.data.items.length === 0 ? (
          <EmptyState title={scope === 'upcoming' ? 'No upcoming bookings' : 'Nothing here yet'} action={<Button to="/movies" variant="primary">Find a movie</Button>}>
            {scope === 'upcoming' ? 'When you book tickets they will appear here.' : 'Finished and cancelled bookings will appear here.'}
          </EmptyState>
        ) : (
          <>
            <ul className="booking-list">
              {result.data.items.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </ul>
            <Pagination
              page={result.data.page}
              totalPages={result.data.totalPages}
              onChange={(p) => setParams({ ...(scope === 'past' && { scope }), page: String(p) })}
              label="Booking pages"
            />
          </>
        ))}
    </div>
  )
}
