import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { getBooking, releaseBooking } from '../api/bookings.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import HoldCountdown from '../components/bookings/HoldCountdown.jsx'
import BookingSummary from '../components/bookings/BookingSummary.jsx'
import DemoPaymentPanel from '../components/bookings/DemoPaymentPanel.jsx'
import Button from '../components/ui/Button.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import { PageLoader, ErrorState, EmptyState } from '../components/ui/Feedback.jsx'

export default function CheckoutPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { result, reload } = useApiResource((signal) => getBooking(id, signal), id)
  const [expired, setExpired] = useState(false)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [releasing, setReleasing] = useState(false)

  if (!result) return <PageLoader label="Loading your booking…" />
  if (!result.ok) {
    return (
      <div className="container page">
        {result.status === 404 ? (
          <EmptyState title="Booking not found" action={<Button to="/movies">Browse movies</Button>}>
            This booking doesn&apos;t exist or belongs to another account.
          </EmptyState>
        ) : (
          <ErrorState message={errorMessage(result)} onRetry={reload} />
        )}
      </div>
    )
  }

  const { booking, payments, serverTime } = result.data
  if (booking.status === 'CONFIRMED') return <Navigate to={`/bookings/${booking.id}`} replace />
  const showtimeLink = `/showtimes/${booking.showtime}`

  if (booking.status !== 'HELD' || expired) {
    return (
      <div className="container page" style={{ maxWidth: '44rem' }}>
        <EmptyState
          title={booking.status === 'RELEASED' ? 'These seats were released' : 'Your seat hold has expired'}
          action={
            <Button to={showtimeLink} variant="primary">
              Choose seats again
            </Button>
          }
        >
          Seats are held for 10 minutes. You were not charged.
        </EmptyState>
      </div>
    )
  }

  const onRelease = async () => {
    setReleasing(true)
    const released = await releaseBooking(booking.id)
    setReleasing(false)
    setConfirmRelease(false)
    if (released.ok) {
      toast.info('Seats released.')
      navigate(showtimeLink)
    } else {
      toast.error(errorMessage(released))
    }
  }

  return (
    <div className="container page checkout">
      <div className="page-header">
        <div>
          <h1>Review and pay</h1>
          <p className="muted">
            Booking reference <strong>{booking.reference}</strong>
          </p>
        </div>
        <HoldCountdown
          expiresAt={booking.holdExpiresAt}
          serverTime={serverTime}
          onExpire={() => {
            setExpired(true)
            reload()
          }}
        />
      </div>
      <div className="checkout-grid">
        <BookingSummary booking={booking} />
        <div className="stack">
          <DemoPaymentPanel
            booking={booking}
            payments={payments}
            onPaid={() => {
              toast.success('Payment successful — enjoy the show!')
              navigate(`/bookings/${booking.id}?confirmed=1`, { replace: true })
            }}
            onHoldExpired={() => {
              setExpired(true)
              reload()
            }}
            onAlreadyPaid={() => navigate(`/bookings/${booking.id}`, { replace: true })}
          />
          <div className="cluster">
            <Button onClick={() => setConfirmRelease(true)}>Change seats</Button>
            <Link to={showtimeLink}>Back to seat map</Link>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmRelease}
        title="Release these seats?"
        confirmLabel="Release seats"
        cancelLabel="Keep them"
        busy={releasing}
        onConfirm={onRelease}
        onCancel={() => setConfirmRelease(false)}
      >
        Other customers will be able to book them straight away.
      </ConfirmDialog>
    </div>
  )
}
