import { formatDateTime, formatDuration, formatPrice } from '../../utils/format.js'
import MoviePoster from '../movies/MoviePoster.jsx'

/**
 * What the customer is buying, from the booking's own snapshot (so it stays accurate even if the
 * movie or showtime is edited later). Prices and total are the server's figures.
 */
export default function BookingSummary({ booking, heading = 'Your booking' }) {
  const { snapshot, seats } = booking
  return (
    <section className="card booking-summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">{heading}</h2>
      <div className="booking-summary-head">
        <div className="booking-summary-poster">
          <MoviePoster movie={{ title: snapshot.movie.title, posterUrl: snapshot.movie.posterUrl }} />
        </div>
        <div>
          <h3>{snapshot.movie.title}</h3>
          <p className="muted">
            {snapshot.movie.certification} · {formatDuration(snapshot.movie.durationMins)} · {snapshot.language}
          </p>
          <p>
            <strong>{formatDateTime(snapshot.startsAt)}</strong>
            <br />
            {snapshot.theatre.name}, {snapshot.screen.name}
            {snapshot.screen.format && ` (${snapshot.screen.format})`}
          </p>
        </div>
      </div>
      <table className="table seats-table">
        <caption className="visually-hidden">Seats and prices</caption>
        <thead>
          <tr>
            <th scope="col">Seat</th>
            <th scope="col">Type</th>
            <th scope="col" style={{ textAlign: 'right' }}>
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {seats.map((s) => (
            <tr key={s.seatId}>
              <td>{s.seatId}</td>
              <td>{s.categoryName}</td>
              <td style={{ textAlign: 'right' }}>{formatPrice(s.price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Total <span className="faint">(no taxes or fees)</span>
            </th>
            <td style={{ textAlign: 'right' }}>
              <strong>{formatPrice(booking.totalAmount)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
