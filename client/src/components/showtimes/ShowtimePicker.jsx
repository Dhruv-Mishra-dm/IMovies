import { Link, useSearchParams } from 'react-router-dom'
import { listCities, listShowtimeDates, listShowtimes } from '../../api/cinema.js'
import { errorMessage } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import FormField from '../ui/FormField.jsx'
import { PageLoader, ErrorState, EmptyState } from '../ui/Feedback.jsx'
import { formatPrice, formatShortDay, formatTime } from '../../utils/format.js'

const FILLING_FAST = 0.2 // show a hint when fewer than 20% of seats are left

function availabilityHint(show) {
  if (show.seatsLeft === 0) return 'Sold out'
  if (show.seatsLeft / show.capacity < FILLING_FAST) return `${show.seatsLeft} left`
  return null
}

function ShowtimeButton({ show }) {
  const hint = availabilityHint(show)
  const soldOut = show.seatsLeft === 0
  const label = `${formatTime(show.startsAt)}, ${show.language} ${show.format}, from ${formatPrice(show.priceFrom)}${hint ? `, ${hint}` : ''}`
  const content = (
    <>
      <span className="showtime-time">{formatTime(show.startsAt)}</span>
      <span className="showtime-meta">
        {show.language} · {show.format}
      </span>
      {hint && <span className={`showtime-hint${soldOut ? ' sold-out' : ''}`}>{hint}</span>}
    </>
  )
  if (soldOut) {
    return (
      <span className="showtime-button disabled" aria-label={label} aria-disabled="true">
        {content}
      </span>
    )
  }
  return (
    <Link to={`/showtimes/${show.id}`} className="showtime-button" aria-label={label}>
      {content}
    </Link>
  )
}

/** Groups shows by theatre (on a movie page) or by movie (on a theatre page), keeping time order. */
function group(showtimes, by) {
  const groups = new Map()
  for (const show of showtimes) {
    const key = show[by].id
    if (!groups.has(key)) groups.set(key, { [by]: show[by], shows: [] })
    groups.get(key).shows.push(show)
  }
  return [...groups.values()]
}

/**
 * Date tabs + (optionally) a city filter + showtimes grouped by theatre or movie.
 * Selected date and city live in the URL (?date=&city=) so the choice survives reloads and Back.
 */
export default function ShowtimePicker({ movieId, theatreId, groupBy = 'theatre', showCityFilter = true }) {
  const [params, setParams] = useSearchParams()
  const city = params.get('city') ?? ''
  const scope = { ...(movieId && { movie: movieId }), ...(theatreId && { theatre: theatreId }), ...(city && { city }) }

  const cities = useApiResource((signal) => listCities(signal), showCityFilter ? 'cities' : 'none')
  const dates = useApiResource((signal) => listShowtimeDates(scope, signal), JSON.stringify(scope))
  const available = dates.result?.ok ? dates.result.data.dates : []
  const requested = params.get('date')
  const date = available.includes(requested) ? requested : available[0]
  const shows = useApiResource(
    (signal) => (date ? listShowtimes({ ...scope, date }, signal) : Promise.resolve({ ok: true, data: { showtimes: [] } })),
    JSON.stringify({ ...scope, date }),
  )

  const update = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true, preventScrollReset: true })
  }

  return (
    <section className="showtime-picker" aria-labelledby="showtimes-heading">
      <div className="section-header">
        <h2 id="showtimes-heading">Showtimes</h2>
        {showCityFilter && cities.result?.ok && (
          <FormField label="City">
            <select className="select" value={city} onChange={(e) => update({ city: e.target.value, date: null })}>
              <option value="">All cities</option>
              {cities.result.data.cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </FormField>
        )}
      </div>

      {!dates.result && <PageLoader label="Loading showtimes…" />}
      {dates.result && !dates.result.ok && <ErrorState message={errorMessage(dates.result)} onRetry={dates.reload} />}
      {dates.result?.ok && available.length === 0 && (
        <EmptyState title="No upcoming shows">{city ? `Nothing is scheduled in ${city} yet. Try another city.` : 'Nothing is scheduled yet. Check back soon.'}</EmptyState>
      )}

      {available.length > 0 && (
        <>
          <div className="date-tabs" role="group" aria-label="Show date">
            {available.map((key) => (
              <button key={key} type="button" aria-pressed={key === date} onClick={() => update({ date: key })}>
                {formatShortDay(`${key}T12:00:00+05:30`)}
              </button>
            ))}
          </div>
          {!shows.result && <PageLoader label="Loading showtimes…" />}
          {shows.result && !shows.result.ok && <ErrorState message={errorMessage(shows.result)} onRetry={shows.reload} />}
          {shows.result?.ok && (
            <ul className="showtime-groups">
              {group(shows.result.data.showtimes, groupBy).map((g) => (
                <li key={g[groupBy].id} className="showtime-group">
                  <div className="showtime-group-header">
                    {groupBy === 'theatre' ? (
                      <>
                        <h3>
                          <Link to={`/theatres/${g.theatre.slug}`}>{g.theatre.name}</Link>
                        </h3>
                        <p className="faint">{g.theatre.address}</p>
                      </>
                    ) : (
                      <>
                        <h3>
                          <Link to={`/movies/${g.movie.slug}`}>{g.movie.title}</Link>
                        </h3>
                        <p className="faint">{g.movie.certification}</p>
                      </>
                    )}
                  </div>
                  <ul className="showtime-list">
                    {g.shows.map((show) => (
                      <li key={show.id}>
                        <ShowtimeButton show={show} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="faint" style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
        All times are India Standard Time (IST).
      </p>
    </section>
  )
}
