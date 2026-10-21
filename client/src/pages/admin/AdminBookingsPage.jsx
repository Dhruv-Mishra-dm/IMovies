import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as adminApi from '../../api/admin.js'
import { errorMessage } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import BookingSummary from '../../components/bookings/BookingSummary.jsx'
import Button from '../../components/ui/Button.jsx'
import FormField from '../../components/ui/FormField.jsx'
import Pagination from '../../components/ui/Pagination.jsx'
import StatusBadge from '../../components/ui/StatusBadge.jsx'
import { PageLoader, ErrorState, EmptyState } from '../../components/ui/Feedback.jsx'
import { formatDateTime, formatPrice } from '../../utils/format.js'
import { BOOKING_STATUS, PAYMENT_STATUS, REFUND_STATUS, CANCELLATION_REASONS } from '../../utils/bookingStatus.js'

export function AdminBookingsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [text, setText] = useState(q)
  const query = { ...(q && { q }), ...(status && { status }), page }
  const { result, reload } = useApiResource((signal) => adminApi.listBookings(query, signal), JSON.stringify(query))
  const set = (changes) => setParams(Object.fromEntries(Object.entries({ q, status, ...changes }).filter(([, v]) => v)))

  return (
    <>
      <div className="page-header">
        <h1>Bookings</h1>
      </div>
      <form
        className="toolbar"
        style={{ gridTemplateColumns: 'minmax(12rem, 2fr) minmax(9rem, 1fr) auto' }}
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          set({ q: text.trim(), page: '' })
        }}
      >
        <FormField label="Reference, customer email or name">
          <input className="input" type="search" placeholder="IMV-… or name@example.com" value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
        <FormField label="Status">
          <select className="select" value={status} onChange={(e) => set({ status: e.target.value, page: '' })}>
            <option value="">Any status</option>
            {Object.entries(BOOKING_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <Button type="submit">Search</Button>
      </form>
      {!result && <PageLoader />}
      {result && !result.ok && <ErrorState message={errorMessage(result)} onRetry={reload} />}
      {result?.ok &&
        (result.data.items.length === 0 ? (
          <EmptyState title="No bookings found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Show</th>
                    <th scope="col">Seats</th>
                    <th scope="col">Total</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link to={`/admin/bookings/${b.id}`}>{b.reference}</Link>
                      </td>
                      <td>
                        {b.user?.name}
                        <div className="faint">{b.user?.email}</div>
                      </td>
                      <td>
                        {b.snapshot.movie.title}
                        <div className="faint">{formatDateTime(b.snapshot.startsAt)}</div>
                      </td>
                      <td>{b.seats.map((s) => s.seatId).join(', ')}</td>
                      <td>{formatPrice(b.totalAmount)}</td>
                      <td>
                        <StatusBadge status={b.status} map={BOOKING_STATUS} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={result.data.page} totalPages={result.data.totalPages} onChange={(p) => set({ page: String(p) })} />
          </>
        ))}
    </>
  )
}

export function AdminBookingDetailPage() {
  const { id } = useParams()
  const { result, reload } = useApiResource((signal) => adminApi.getBooking(id, signal), id)
  if (!result) return <PageLoader />
  if (!result.ok) {
    return result.status === 404 ? (
      <EmptyState title="Booking not found" action={<Button to="/admin/bookings">All bookings</Button>} />
    ) : (
      <ErrorState message={errorMessage(result)} onRetry={reload} />
    )
  }
  const { booking, payments, refunds, showtime } = result.data
  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted" style={{ marginBottom: 'var(--space-1)' }}>
            <Link to="/admin/bookings">Bookings</Link>
          </p>
          <h1>{booking.reference}</h1>
          <p className="muted">
            <StatusBadge status={booking.status} map={BOOKING_STATUS} /> · created {formatDateTime(booking.createdAt)}
            {booking.cancellation?.reason && ` · ${CANCELLATION_REASONS[booking.cancellation.reason]}`}
          </p>
        </div>
      </div>
      <div className="checkout-grid">
        <BookingSummary booking={booking} heading="Booking" />
        <div className="stack">
          <section className="card" aria-labelledby="customer-heading">
            <h2 id="customer-heading">Customer</h2>
            <dl className="details-list">
              <dt>Name</dt>
              <dd>{booking.user?.name}</dd>
              <dt>Email</dt>
              <dd>{booking.user?.email}</dd>
            </dl>
          </section>
          <section className="card" aria-labelledby="pay-heading">
            <h2 id="pay-heading">Payments &amp; refunds</h2>
            {payments.length === 0 && <p className="muted">No payment attempts.</p>}
            <ul className="attempt-list">
              {payments.map((p) => (
                <li key={p.id}>
                  <span>{formatDateTime(p.createdAt)}</span>
                  <StatusBadge status={p.status} map={PAYMENT_STATUS} />
                  <span>{formatPrice(p.amount)}</span>
                  {p.failureCode && <span className="faint">{p.failureCode}</span>}
                </li>
              ))}
              {refunds.map((r) => (
                <li key={r.id}>
                  <span>{formatDateTime(r.createdAt)}</span>
                  <StatusBadge status={r.status} map={REFUND_STATUS} />
                  <span>{formatPrice(r.amount)}</span>
                  <span className="faint">{r.reason.replaceAll('_', ' ').toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </section>
          {showtime && (
            <section className="card" aria-labelledby="show-heading">
              <h2 id="show-heading">Show</h2>
              <p className="muted" style={{ margin: 0 }}>
                {showtime.status === 'CANCELLED' ? `Cancelled by the cinema: ${showtime.cancellation?.reason ?? ''}` : `Scheduled for ${formatDateTime(showtime.startsAt)}`}
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
