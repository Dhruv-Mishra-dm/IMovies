import { apiRequest } from './client.js'

export const getSeatAvailability = (showtimeId, signal) => apiRequest(`/api/showtimes/${encodeURIComponent(showtimeId)}/seats`, { signal })
export const createBooking = (body) => apiRequest('/api/bookings', { method: 'POST', body })
export const getBooking = (id, signal) => apiRequest(`/api/bookings/${encodeURIComponent(id)}`, { signal })
export const releaseBooking = (id) => apiRequest(`/api/bookings/${encodeURIComponent(id)}/release`, { method: 'POST' })
