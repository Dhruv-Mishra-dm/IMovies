import { apiRequest } from './client.js'

export function fetchHealth(signal) {
  return apiRequest('/api/health', { signal })
}
