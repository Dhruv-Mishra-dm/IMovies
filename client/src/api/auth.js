import { apiRequest } from './client.js'

export const getMe = (signal) => apiRequest('/api/auth/me', { signal })
export const register = (body) => apiRequest('/api/auth/register', { method: 'POST', body })
export const login = (body) => apiRequest('/api/auth/login', { method: 'POST', body })
export const logout = () => apiRequest('/api/auth/logout', { method: 'POST' })
export const logoutAll = () => apiRequest('/api/auth/logout-all', { method: 'POST' })
export const updateProfile = (body) => apiRequest('/api/auth/me', { method: 'PATCH', body })
export const changePassword = (body) => apiRequest('/api/auth/change-password', { method: 'POST', body })
