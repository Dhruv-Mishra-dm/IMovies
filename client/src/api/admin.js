import { apiRequest } from './client.js'

const enc = encodeURIComponent

// Every call here is also checked on the server (admin role required); the UI hides nothing for security.
export const getStats = (signal) => apiRequest('/api/admin/stats', { signal })

export const listMovies = (params, signal) => apiRequest('/api/admin/movies', { params, signal })
export const getMovie = (id, signal) => apiRequest(`/api/admin/movies/${enc(id)}`, { signal })
export const createMovie = (body) => apiRequest('/api/admin/movies', { method: 'POST', body })
export const updateMovie = (id, body) => apiRequest(`/api/admin/movies/${enc(id)}`, { method: 'PATCH', body })
export const publishMovie = (id) => apiRequest(`/api/admin/movies/${enc(id)}/publish`, { method: 'POST' })
export const archiveMovie = (id) => apiRequest(`/api/admin/movies/${enc(id)}/archive`, { method: 'POST' })
export const deleteMovie = (id) => apiRequest(`/api/admin/movies/${enc(id)}`, { method: 'DELETE' })

export const listTheatres = (signal) => apiRequest('/api/admin/theatres', { signal })
export const getTheatre = (id, signal) => apiRequest(`/api/admin/theatres/${enc(id)}`, { signal })
export const createTheatre = (body) => apiRequest('/api/admin/theatres', { method: 'POST', body })
export const updateTheatre = (id, body) => apiRequest(`/api/admin/theatres/${enc(id)}`, { method: 'PATCH', body })

export const createScreen = (theatreId, body) => apiRequest(`/api/admin/theatres/${enc(theatreId)}/screens`, { method: 'POST', body })
export const getScreen = (id, signal) => apiRequest(`/api/admin/screens/${enc(id)}`, { signal })
export const updateScreen = (id, body) => apiRequest(`/api/admin/screens/${enc(id)}`, { method: 'PATCH', body })
export const deleteScreen = (id) => apiRequest(`/api/admin/screens/${enc(id)}`, { method: 'DELETE' })

export const listShowtimes = (params, signal) => apiRequest('/api/admin/showtimes', { params, signal })
export const createShowtime = (body) => apiRequest('/api/admin/showtimes', { method: 'POST', body })
export const updateShowtime = (id, body) => apiRequest(`/api/admin/showtimes/${enc(id)}`, { method: 'PATCH', body })
export const cancelShowtime = (id, reason) => apiRequest(`/api/admin/showtimes/${enc(id)}/cancel`, { method: 'POST', body: { reason } })

export const listBookings = (params, signal) => apiRequest('/api/admin/bookings', { params, signal })
export const getBooking = (id, signal) => apiRequest(`/api/admin/bookings/${enc(id)}`, { signal })
