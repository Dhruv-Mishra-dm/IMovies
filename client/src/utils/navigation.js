/** Only allow same-site relative paths after login (prevents open redirects like ?next=https://evil). */
export function safeNextPath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  return raw
}
