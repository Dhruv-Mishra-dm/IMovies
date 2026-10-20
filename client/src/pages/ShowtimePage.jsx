import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { getShowtime } from '../api/cinema.js'
import { getSeatAvailability, createBooking, releaseBooking } from '../api/bookings.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import { useAuth } from '../hooks/useAuth.js'
import SeatMap from '../components/showtimes/SeatMap.jsx'
import Button from '../components/ui/Button.jsx'
import Alert from '../components/ui/Alert.jsx'
import { PageLoader, ErrorState, EmptyState } from '../components/ui/Feedback.jsx'
import { formatDateTime, formatPrice } from '../utils/format.js'
import { saveSelection, loadSelection, clearSelection } from '../utils/selection.js'

const MAX_SEATS = 10
const CLOSED_MESSAGES = {
  CANCELLED: 'This show has been cancelled.',
  STARTED: 'This show has already started, so booking is closed.',
  COMPLETED: 'This show has finished.',
}

function SelectionSummary({ seats, prices, onContinue, busy, disabled }) {
  const priceOf = new Map(prices.map((p) => [p.category, p.amount]))
  const total = seats.reduce((sum, s) => sum + (priceOf.get(s.category) ?? 0), 0)
  return (
    <div className="selection-bar" role="region" aria-label="Your selection">
      <div className="container">
        <div>
          <strong>
            {seats.length} {seats.length === 1 ? 'seat' : 'seats'}
          </strong>
          <span className="muted"> · {seats.map((s) => s.id).join(', ')}</span>
          {/* Indicative only: the server calculates the price that is actually charged. */}
          <div className="selection-total">{formatPrice(total)}</div>
        </div>
        <Button variant="primary" onClick={onContinue} loading={busy} disabled={disabled}>
          Continue
        </Button>
      </div>
    </div>
  )
}

export default function ShowtimePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { status: authStatus } = useAuth()
  const showtime = useApiResource((signal) => getShowtime(id, signal), id)
  // Wait until we know who is logged in, so the one request can mark the viewer's own held seats.
  const seats = useApiResource((signal) => getSeatAvailability(id, signal), authStatus === 'loading' ? null : `${id}:${authStatus}`)
  const [selected, setSelected] = useState(() => new Set(loadSelection(id)))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const takenStates = useMemo(() => (seats.result?.ok ? seats.result.data.seats : seats.previous?.data?.seats ?? {}), [seats.result, seats.previous])
  // Drop selected seats that have meanwhile been taken by someone else.
  const stillFree = [...selected].filter((seatId) => !takenStates[seatId])
  if (stillFree.length !== selected.size) {
    setSelected(new Set(stillFree))
    setNotice('Some seats you picked were just taken by someone else and have been removed from your selection.')
  }

  if (!showtime.result) return <PageLoader label="Loading seats…" />
  if (!showtime.result.ok) {
    return (
      <div className="container page">
        {showtime.result.status === 404 || showtime.result.status === 400 ? (
          <EmptyState title="Showtime not found" action={<Button to="/movies">Browse movies</Button>}>
            This showtime doesn&apos;t exist.
          </EmptyState>
        ) : (
          <ErrorState message={errorMessage(showtime.result)} onRetry={showtime.reload} />
        )}
      </div>
    )
  }

  const show = showtime.result.data.showtime
  const availability = seats.result?.ok ? seats.result.data.availability : show.availability
  const myHold = seats.result?.ok ? seats.result.data.myHold : null
  const open = availability === 'OPEN'
  const canSelect = open && !myHold

  const seatList = show.seatMap.rows.flatMap((row) => row.seats.map((s) => ({ ...s, id: `${row.label}${s.number}` })))
  const selectedSeats = seatList.filter((s) => selected.has(s.id))

  const toggle = (seatId) => {
    setNotice(null)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(seatId)) next.delete(seatId)
      else if (next.size >= MAX_SEATS) {
        toast.info(`You can book up to ${MAX_SEATS} seats at a time.`, { toastId: 'max-seats' })
        return current
      } else next.add(seatId)
      return next
    })
  }

  const onContinue = async () => {
    const seatIds = [...selected]
    if (authStatus !== 'authenticated') {
      saveSelection(id, seatIds) // restored after login
      navigate(`/login?next=${encodeURIComponent(`/showtimes/${id}`)}`)
      return
    }
    setBusy(true)
    const result = await createBooking({ showtimeId: id, seatIds })
    setBusy(false)
    if (result.ok) {
      clearSelection(id)
      navigate(`/bookings/${result.data.booking.id}/checkout`)
      return
    }
    const code = result.data?.error?.code
    if (code === 'SEATS_UNAVAILABLE') {
      const lost = result.data.error.details?.seats ?? []
      setSelected((current) => new Set([...current].filter((s) => !lost.includes(s))))
      setNotice(`Sorry — ${lost.join(', ')} ${lost.length === 1 ? 'was' : 'were'} just taken by someone else. Please choose again.`)
    } else {
      toast.error(errorMessage(result))
    }
    seats.reload()
    if (code === 'SHOWTIME_UNAVAILABLE') showtime.reload()
  }

  const onRelease = async () => {
    setBusy(true)
    const result = await releaseBooking(myHold.id)
    setBusy(false)
    if (!result.ok) toast.error(errorMessage(result))
    seats.reload()
  }

  return (
    <div className={`container page${selected.size ? ' has-selection-bar' : ''}`}>
      <div className="page-header">
        <div>
          <p className="hero-eyebrow">
            <Link to={`/movies/${show.movie.slug}`}>{show.movie.title}</Link>
          </p>
          <h1>{formatDateTime(show.startsAt)}</h1>
          <p className="muted">
            {show.theatre.name} · {show.screen.name} · {show.language} · {show.format} · {show.movie.certification}
          </p>
        </div>
      </div>

      <div className="stack">
        {CLOSED_MESSAGES[availability] && <Alert type="warning">{CLOSED_MESSAGES[availability]}</Alert>}
        {myHold && (
          <Alert
            type="info"
            title={`You're holding ${myHold.seats.map((s) => s.seatId).join(', ')}`}
            action={
              <div className="cluster">
                <Button to={`/bookings/${myHold.id}/checkout`} variant="primary" size="sm">
                  Continue to payment
                </Button>
                <Button size="sm" onClick={onRelease} loading={busy}>
                  Release and choose again
                </Button>
              </div>
            }
          >
            Finish paying for these seats, or release them to pick different ones.
          </Alert>
        )}
        {notice && <Alert type="warning">{notice}</Alert>}
        {seats.result && !seats.result.ok && <ErrorState message={errorMessage(seats.result)} onRetry={seats.reload} />}
        <ul className="price-list muted" aria-label="Prices">
          {show.prices.map((p) => (
            <li key={p.category}>
              {p.name}: <strong>{formatPrice(p.amount)}</strong>
            </li>
          ))}
          {open && <li>Select up to {MAX_SEATS} seats</li>}
        </ul>
        {/* Never show seats as free before we know which are taken. */}
        {!seats.result && !seats.previous ? (
          <PageLoader label="Checking which seats are free…" />
        ) : (
          <SeatMap seatMap={show.seatMap} prices={show.prices} takenStates={takenStates} selected={selected} onToggle={canSelect ? toggle : undefined} />
        )}
      </div>

      {canSelect && selected.size > 0 && (
        <SelectionSummary seats={selectedSeats} prices={show.prices} onContinue={onContinue} busy={busy} disabled={busy} />
      )}
    </div>
  )
}
