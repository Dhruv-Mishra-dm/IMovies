// Remembers the seats a visitor picked before being asked to log in, so they aren't lost.
// sessionStorage is per-tab and cleared when the tab closes; it may be unavailable (private mode),
// in which case we simply don't remember.

const key = (showtimeId) => `imovies:selection:${showtimeId}`

export function saveSelection(showtimeId, seatIds) {
  try {
    sessionStorage.setItem(key(showtimeId), JSON.stringify(seatIds))
  } catch {
    /* storage unavailable */
  }
}

export function loadSelection(showtimeId) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(showtimeId)) ?? '[]')
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function clearSelection(showtimeId) {
  try {
    sessionStorage.removeItem(key(showtimeId))
  } catch {
    /* storage unavailable */
  }
}
