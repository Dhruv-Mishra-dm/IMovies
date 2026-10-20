/** True when the movie's release date is still in the future. */
export function isComingSoon(movie, now = new Date()) {
  return new Date(movie.releaseDate) > now
}
