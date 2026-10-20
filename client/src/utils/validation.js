// Client-side checks mirror the server's rules (server/src/validators/auth.js) so users get instant
// feedback. They are a convenience only — the server validates everything again.

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(value) {
  if (!value.trim()) return 'Enter your email address'
  if (!EMAIL_PATTERN.test(value.trim())) return 'Enter a valid email address, like name@example.com'
  return null
}

export function validateNewPassword(value) {
  if (value.length < 8) return 'Use at least 8 characters'
  if (new TextEncoder().encode(value).length > 72) return 'Use at most 72 bytes (about 72 letters)'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Include at least one letter and one number'
  return null
}

export function validateName(value) {
  if (!value.trim()) return 'Enter your name'
  if (value.trim().length > 80) return 'Use at most 80 characters'
  return null
}

/** Runs { field: validator(value) } and returns only the fields with errors. */
export function collectErrors(checks) {
  return Object.fromEntries(Object.entries(checks).filter(([, message]) => message))
}
