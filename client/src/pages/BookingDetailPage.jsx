import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { getBooking, cancelBooking } from '../api/bookings.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import { useBookingUpdates } from '../hooks/useShowtimeLive.js'
import BookingSummary from '../components/bookings/BookingSummary.jsx'
import Button from '../components/ui/Button.jsx'
import Alert from '../components/ui/Alert.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { PageLoader, ErrorState, EmptyState } from '../components/ui/Feedback.jsx'
import { formatDateTime, formatPrice } from '../utils/format.js'
import { BOOKING_STATUS, PAYMENT_STATUS, REFUND_STATUS, CANCELLATION_REASONS } from '../utils/bookingStatus.js'

function CancellationSection({ booking, cancellation, onCancelled }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (booking.status !== 'CONFIRMED') return null
  if (!cancellation.allowed) {
    return (
      <p className="muted">
        This booking can no longer be cancelled: cancellations close 2 hours before the show (at {formatDateTime(cancellation.cutoffAt)}).
      </p>
    )
  }

  const onConfirm = async () => {
    setBusy(true)
    const result = await cancelBooking(booking.id)
    setBusy(false)
    setOpen(false)
    if (result.ok) {
      toast.success('Booking cancelled. Your refund has been recorded.')
      onCancelled()
    } else {
      toast.error(errorMessage(result))
      onCancelled() // reload: the server's answer may have changed eligibility
    }
  }

  return (
    <>
      <p className="muted">
        You can cancel for a full refund of {formatPrice(booking.totalAmount)} until {formatDateTime(cancellation.cutoffAt)} (2 hours before the show).
      </p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
      <ConfirmDialog
        open={open}
        title="Cancel this booking?"
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        danger
        busy={busy}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      >
        Your seats will be released and {formatPrice(booking.totalAmount)} will be refunded (simulated). This can&apos;t be undone.
      </ConfirmDialog>
    </>
  )
}

export default function BookingDetailPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { result, reload } = useApiResource((signal) => getBooking(id, signal), id)
  useBookingUpdates((update) => {
    if (update.bookingId === id) reload()
  })

  if (!result) return <PageLoader label="Loading your booking…" />
  if (!result.ok) {
    return (
      <div className="container page">
        {result.status === 404 ? (
          <EmptyState title="Booking not found" action={<Button to="/bookings">My bookings</Button>}>
            This booking doesn&apos;t exist or belongs to another account.
          </EmptyState>
        ) : (
          <ErrorState message={errorMessage(result)} onRetry={reload} />
        )}
      </div>
    )
  }

  const { booking, payments, refunds, cancellation } = result.data
  const justConfirmed = params.get('confirmed') === '1' && booking.status === 'CONFIRMED'
  const paid = payments.find((p) => p.status === 'SUCCEEDED' || p.status === 'REFUNDED')

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <p className="muted" style={{ marginBottom: 'var(--space-1)' }}>
            <Link to="/bookings">My bookings</Link>
          </p>
          <h1>{booking.snapshot.movie.title}</h1>
          <p className="muted">
            <StatusBadge status={booking.status} map={BOOKING_STATUS} /> · Booked {formatDateTime(booking.createdAt)}
          </p>
        </div>
      </div>

      <div className="stack">
        {justConfirmed && (
          <Alert type="success" title="Booking confirmed">
            Your seats are booked. Show the reference below at the cinema.
          </Alert>
        )}
        {booking.status === 'HELD' && (
          <Alert type="warning" title="Payment not completed" action={<Button to={`/bookings/${booking.id}/checkout`} size="sm" variant="primary">Go to payment</Button>}>
            These seats are only held until the timer runs out.
          </Alert>
        )}
        {booking.status === 'CANCELLED' && <Alert type="info">{CANCELLATION_REASONS[booking.cancellation?.reason] ?? 'This booking was cancelled.'}</Alert>}

        <div className="checkout-grid">
          <BookingSummary booking={booking} heading="Ticket" />
          <div className="stack">
            <section className="card ticket-card" aria-labelledby="reference-heading">
              <h2 id="reference-heading" className="visually-hidden">
                Booking reference
              </h2>
              <p className="faint" style={{ margin: 0 }}>
                Booking reference
              </p>
              <p className="ticket-reference">{booking.reference}</p>
              <p className="faint" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                A reference on its own is not proof of entry: the cinema checks it against IMovies&apos; records, so cancelled or altered bookings won&apos;t be admitted.
              </p>
            </section>

            <section className="card" aria-labelledby="payment-heading">
              <h2 id="payment-heading">Payment</h2>
              {paid ? (
                <dl className="details-list">
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={paid.status} map={PAYMENT_STATUS} />
                  </dd>
                  <dt>Amount</dt>
                  <dd>{formatPrice(paid.amount)} (demo payment)</dd>
                  <dt>Paid</dt>
                  <dd>{formatDateTime(paid.succeededAt)}</dd>
                </dl>
              ) : (
                <p className="muted">No successful payment for this booking.</p>
              )}
              {refunds.map((r) => (
                <dl key={r.id} className="details-list" style={{ marginTop: 'var(--space-3)' }}>
                  <dt>Refund</dt>
                  <dd>
                    <StatusBadge status={r.status} map={REFUND_STATUS} /> {formatPrice(r.amount)}
                  </dd>
                </dl>
              ))}
            </section>

            {booking.status === 'CONFIRMED' && (
              <section className="card" aria-labelledby="cancel-heading">
                <h2 id="cancel-heading">Cancellation</h2>
                <CancellationSection booking={booking} cancellation={cancellation} onCancelled={reload} />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
