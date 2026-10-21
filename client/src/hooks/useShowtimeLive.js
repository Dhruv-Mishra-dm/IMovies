import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../api/socket.js'

/**
 * Subscribes to real-time updates for one show.
 *
 *  - onSeats(changes)   — seats changed somewhere (a hint: the page should refetch the truth)
 *  - onResync()         — we (re)connected: anything could have changed while offline, refetch now
 *  - onCancelled()      — the cinema cancelled the show
 *
 * Returns the connection status ('connecting' | 'live' | 'offline') for a small indicator.
 * Socket events are never the source of truth; the API is.
 */
export function useShowtimeLive(showtimeId, { onSeats, onResync, onCancelled, getSocketImpl = getSocket } = {}) {
  const [status, setStatus] = useState('connecting')
  // Keep the latest callbacks without re-subscribing on every render.
  const handlers = useRef({ onSeats, onResync, onCancelled })
  useEffect(() => {
    handlers.current = { onSeats, onResync, onCancelled }
  })

  useEffect(() => {
    if (!showtimeId) return undefined
    const socket = getSocketImpl()

    const join = () => {
      socket.emit('showtime:join', showtimeId, (reply) => {
        if (!reply?.ok) {
          setStatus('offline')
          return
        }
        setStatus('live')
        // After EVERY (re)join, refetch the truth: events may have been missed before we joined.
        handlers.current.onResync?.()
      })
    }
    const onSeatsChanged = (payload) => {
      if (payload?.showtimeId === showtimeId) handlers.current.onSeats?.(payload.changes ?? [])
    }
    const onShowCancelled = (payload) => {
      if (payload?.showtimeId === showtimeId) handlers.current.onCancelled?.()
    }
    const onDisconnect = () => setStatus('offline')

    socket.on('connect', join)
    socket.on('disconnect', onDisconnect)
    socket.on('seats:changed', onSeatsChanged)
    socket.on('showtime:cancelled', onShowCancelled)
    if (socket.connected) join()

    return () => {
      socket.emit('showtime:leave', showtimeId)
      socket.off('connect', join)
      socket.off('disconnect', onDisconnect)
      socket.off('seats:changed', onSeatsChanged)
      socket.off('showtime:cancelled', onShowCancelled)
    }
  }, [showtimeId, getSocketImpl])

  return status
}

/** Personal booking updates (expiry, confirmation, cancellation) for the logged-in user. */
export function useBookingUpdates(onUpdate, { getSocketImpl = getSocket } = {}) {
  const handler = useRef(onUpdate)
  useEffect(() => {
    handler.current = onUpdate
  })
  useEffect(() => {
    const socket = getSocketImpl()
    const listener = (payload) => handler.current?.(payload)
    socket.on('booking:updated', listener)
    return () => socket.off('booking:updated', listener)
  }, [getSocketImpl])
}
