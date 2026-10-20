import { apiRequest } from './client.js'

export const listMovies = (params, signal) => apiRequest('/api/movies', { params, signal })
export const getMovieFilters = (signal) => apiRequest('/api/movies/filters', { signal })
export const getMovie = (idOrSlug, signal) => apiRequest(`/api/movies/${encodeURIComponent(idOrSlug)}`, { signal })
