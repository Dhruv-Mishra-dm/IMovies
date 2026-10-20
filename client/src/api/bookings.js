import { apiRequest } from './client.js'

export const listMyBookings = (params, signal) => apiRequest('/api/bookings', { params, signal })
export const getSeatAvailability = (showtimeId, signal) => apiRequest(`/api/showtimes/${encodeURIComponent(showtimeId)}/seats`, { signal })
export const createBooking = (body) => apiRequest('/api/bookings', { method: 'POST', body })
export const getBooking = (id, signal) => apiRequest(`/api/bookings/${encodeURIComponent(id)}`, { signal })
export const releaseBooking = (id) => apiRequest(`/api/bookings/${encodeURIComponent(id)}/release`, { method: 'POST' })
export const cancelBooking = (id) => apiRequest(`/api/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' })

/** One payment attempt. The same idempotencyKey must be reused when retrying after a network error. */
export const payBooking = (id, { outcome, idempotencyKey }) =>
  apiRequest(`/api/bookings/${encodeURIComponent(id)}/payments`, { method: 'POST', body: { outcome }, headers: { 'Idempotency-Key': idempotencyKey } })
