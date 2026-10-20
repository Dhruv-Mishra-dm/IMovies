import { useState } from 'react'

const PLACEHOLDER = '/posters/placeholder.svg'

/** Poster image with a fixed 2:3 frame (no layout jump while loading) and a fallback if the URL fails. */
export default function MoviePoster({ movie, eager = false, className = '' }) {
  const [failed, setFailed] = useState(false)
  const src = !movie.posterUrl || failed ? PLACEHOLDER : movie.posterUrl
  return (
    <img
      className={`poster ${className}`}
      src={src}
      alt={`Poster for ${movie.title}`}
      width="400"
      height="600"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
