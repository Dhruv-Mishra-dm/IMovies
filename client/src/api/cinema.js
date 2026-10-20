import { apiRequest } from './client.js'

export const listCities = (signal) => apiRequest('/api/cities', { signal })
export const listTheatres = (params, signal) => apiRequest('/api/theatres', { params, signal })
export const getTheatre = (idOrSlug, signal) => apiRequest(`/api/theatres/${encodeURIComponent(idOrSlug)}`, { signal })
export const listShowtimes = (params, signal) => apiRequest('/api/showtimes', { params, signal })
export const listShowtimeDates = (params, signal) => apiRequest('/api/showtimes/dates', { params, signal })
export const getShowtime = (id, signal) => apiRequest(`/api/showtimes/${encodeURIComponent(id)}`, { signal })
