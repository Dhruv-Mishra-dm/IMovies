import { useEffect, useState } from 'react'

/**
 * Counts down to `expiresAt` using the SERVER's clock: `serverTime` is the server's "now" at the moment
 * the data was fetched, so a wrong clock on the visitor's computer doesn't matter. The countdown is only
 * a guide — the server enforces the real expiry. Calls onExpire() once when it reaches zero.
 */
export default function HoldCountdown({ expiresAt, serverTime, onExpire }) {
  const [offset] = useState(() => new Date(serverTime).getTime() - Date.now())
  const remainingNow = () => Math.max(0, new Date(expiresAt).getTime() - (Date.now() + offset))
  const [remaining, setRemaining] = useState(remainingNow)

  useEffect(() => {
    const timer = setInterval(() => {
      const left = remainingNow()
      setRemaining(left)
      if (left === 0) {
        clearInterval(timer)
        onExpire?.()
      }
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt])

  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  const urgent = remaining < 2 * 60_000
  return (
    <div className={`countdown${urgent ? ' urgent' : ''}`}>
      <span className="countdown-time" aria-hidden="true">
        {minutes}:{String(seconds).padStart(2, '0')}
      </span>
      {/* Announce to screen readers once a minute (not every second). */}
      <span className="visually-hidden" role="timer" aria-live="polite">
        {remaining === 0 ? 'Your seat hold has expired' : `${minutes + 1} minute${minutes === 0 ? '' : 's'} left to complete payment`}
      </span>
      <span className="countdown-label">{remaining === 0 ? 'Hold expired' : 'left to pay'}</span>
    </div>
  )
}
