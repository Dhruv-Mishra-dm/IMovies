import { Link } from 'react-router-dom'
import { getStats } from '../../api/admin.js'
import { errorMessage } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import StatusBadge from '../../components/ui/StatusBadge.jsx'
import { PageLoader, ErrorState, EmptyState } from '../../components/ui/Feedback.jsx'
import { formatDateTime, formatPrice } from '../../utils/format.js'
import { BOOKING_STATUS } from '../../utils/bookingStatus.js'

function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {note && <p className="stat-note">{note}</p>}
    </div>
  )
}

export default function AdminDashboardPage() {
  const { result, reload } = useApiResource((signal) => getStats(signal), 'stats')
  if (!result) return <PageLoader label="Loading dashboard…" />
  if (!result.ok) return <ErrorState message={errorMessage(result)} onRetry={reload} />
  const s = result.data

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Figures from the last {s.periodDays} days (demo payments) · updated {formatDateTime(s.generatedAt)}</p>
        </div>
      </div>
      <div className="stat-grid">
        <Stat label="Net revenue" value={formatPrice(s.revenue.net)} note={`${formatPrice(s.revenue.gross)} paid − ${formatPrice(s.revenue.refunded)} refunded`} />
        <Stat label="Tickets sold" value={s.sales.tickets} note={`${s.sales.bookings} confirmed bookings`} />
        <Stat
          label="Occupancy, next 7 days"
          value={`${Math.round(s.occupancy.rate * 100)}%`}
          note={`${s.occupancy.bookedSeats} of ${s.occupancy.capacity} seats booked`}
        />
        <Stat label="Upcoming shows" value={s.catalogue.upcomingShows} note={`${s.catalogue.moviesPublished} published movies · ${s.catalogue.theatresActive} theatres`} />
      </div>

      <div className="grid-2">
        <section aria-labelledby="top-heading">
          <h2 id="top-heading">Top movies</h2>
          {s.topMovies.length === 0 ? (
            <EmptyState title="No sales yet">Confirmed bookings will appear here.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Movie</th>
                    <th scope="col">Tickets</th>
                    <th scope="col">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {s.topMovies.map((m) => (
                    <tr key={m.movieId}>
                      <td>{m.title}</td>
                      <td>{m.tickets}</td>
                      <td>{formatPrice(m.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading">Recent bookings</h2>
          {s.recentBookings.length === 0 ? (
            <EmptyState title="No bookings yet" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Status</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recentBookings.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link to={`/admin/bookings/${b.id}`}>{b.reference}</Link>
                      </td>
                      <td>{b.user?.name}</td>
                      <td>
                        <StatusBadge status={b.status} map={BOOKING_STATUS} />
                      </td>
                      <td>{formatPrice(b.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
