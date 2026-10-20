import { useRef, useState } from 'react'
import { payBooking } from '../../api/bookings.js'
import { errorMessage } from '../../api/client.js'
import Button from '../ui/Button.jsx'
import Alert from '../ui/Alert.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'
import { formatPrice, formatTime } from '../../utils/format.js'
import { PAYMENT_STATUS, newIdempotencyKey } from '../../utils/bookingStatus.js'

const OUTCOMES = [
  { value: 'SUCCESS', label: 'Approve the payment', hint: 'The booking will be confirmed.' },
  { value: 'DECLINED', label: 'Decline: card declined', hint: 'Simulates a failed payment you can retry.' },
  { value: 'INSUFFICIENT_FUNDS', label: 'Decline: insufficient funds', hint: 'Another kind of failure.' },
]

/**
 * DEMO payment: no card details are asked for or sent. The customer picks what the simulated
 * provider should do. The server decides the amount and the result; this panel only reports it.
 *
 * Idempotency: a new key is generated for each new attempt, but KEPT when the request fails at the
 * network level (we don't know whether it reached the server), so "Try again" can never pay twice.
 */
export default function DemoPaymentPanel({ booking, payments = [], onPaid, onHoldExpired, onAlreadyPaid }) {
  const [outcome, setOutcome] = useState('SUCCESS')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [attempts, setAttempts] = useState(payments)
  const keyRef = useRef(null)

  const onPay = async () => {
    keyRef.current ??= newIdempotencyKey()
    setBusy(true)
    setError(null)
    const result = await payBooking(booking.id, { outcome, idempotencyKey: keyRef.current })
    setBusy(false)

    if (result.kind === 'unreachable' || result.kind === 'timeout') {
      // Unknown outcome: keep the same key so the retry is answered with the original result.
      setError(`${errorMessage(result)} Pressing Pay again is safe — you won't be charged twice.`)
      return
    }
    keyRef.current = null // definitive answer: the next attempt is a new one
    if (result.ok) {
      setAttempts(result.data.payments)
      if (result.data.payment.status === 'SUCCEEDED') onPaid(result.data)
      else setError(result.data.payment.failureMessage)
      return
    }
    const code = result.data?.error?.code
    if (code === 'HOLD_EXPIRED') onHoldExpired()
    else if (code === 'BOOKING_ALREADY_PAID') onAlreadyPaid()
    else setError(errorMessage(result))
  }

  return (
    <section className="card demo-payment" aria-labelledby="payment-heading">
      <div className="demo-payment-header">
        <h2 id="payment-heading">Payment</h2>
        <span className="badge badge-warning">Demo payment</span>
      </div>
      <p className="muted">
        This is a simulated payment for demonstration. No card details are needed and no real money is taken. Choose what should happen:
      </p>
      <fieldset className="stack" style={{ gap: 'var(--space-2)' }}>
        <legend className="visually-hidden">Simulated payment result</legend>
        {OUTCOMES.map((o) => (
          <label key={o.value} className={`choice${outcome === o.value ? ' selected' : ''}`}>
            <input type="radio" name="outcome" value={o.value} checked={outcome === o.value} onChange={() => setOutcome(o.value)} />
            <span>
              <strong>{o.label}</strong>
              <span className="faint"> — {o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Alert type="error">{error}</Alert>
        </div>
      )}
      <Button variant="primary" block onClick={onPay} loading={busy} style={{ marginTop: 'var(--space-4)' }}>
        Pay {formatPrice(booking.totalAmount)}
      </Button>
      {attempts.length > 0 && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <h3 style={{ fontSize: 'var(--text-base)' }}>Payment attempts</h3>
          <ul className="attempt-list">
            {attempts.map((p) => (
              <li key={p.id}>
                <span>{formatTime(p.createdAt)}</span>
                <StatusBadge status={p.status} map={PAYMENT_STATUS} />
                {p.failureCode && <span className="faint">{p.failureCode.replaceAll('_', ' ').toLowerCase()}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
