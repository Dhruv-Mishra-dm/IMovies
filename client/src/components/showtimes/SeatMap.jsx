import { useMemo, useRef, useState } from 'react'
import { formatPrice } from '../../utils/format.js'

// Seat states. Each one has a distinct SHAPE/PATTERN as well as colour, and a spoken label,
// so status is never communicated by colour alone.
const SEAT_STATE_LABELS = {
  available: 'available',
  selected: 'selected',
  held: 'held by another customer',
  mine: 'held by you',
  booked: 'booked',
  unavailable: 'not available',
}

function stateOf(seat, takenStates, selected) {
  if (seat.disabled) return 'unavailable'
  if (selected.has(seat.id)) return 'selected'
  return takenStates[seat.id] ?? 'available'
}

/**
 * Interactive seat map.
 *  - seatMap: { categories, rows: [{ label, seats: [{ number, col, category, accessible, disabled }] }] }
 *  - takenStates: { A1: 'booked' | 'held' | 'mine' }  (from the server)
 *  - selected: Set of seat ids chosen in this browser
 *  - onToggle(seatId): called when an available/selected seat is activated; omit for a read-only map
 *
 * Keyboard: the map is ONE tab stop; arrow keys move between seats (roving tabindex), Enter/Space toggles.
 */
export default function SeatMap({ seatMap, prices = [], takenStates = {}, selected = new Set(), onToggle }) {
  const interactive = typeof onToggle === 'function'
  const priceOf = useMemo(() => new Map(prices.map((p) => [p.category, p])), [prices])
  // At least one column, so an empty (half-edited) layout in the admin preview still renders.
  const maxCol = useMemo(() => Math.max(1, ...seatMap.rows.flatMap((r) => r.seats.map((s) => s.col))), [seatMap])
  const rows = useMemo(
    () => seatMap.rows.map((row) => ({ label: row.label, seats: row.seats.map((s) => ({ ...s, id: `${row.label}${s.number}` })) })),
    [seatMap],
  )
  const [focusId, setFocusId] = useState(rows[0]?.seats[0]?.id)
  const buttons = useRef(new Map())

  const moveFocus = (rowIndex, seatIndex, key) => {
    let r = rowIndex
    let s = seatIndex
    if (key === 'ArrowRight') s += 1
    if (key === 'ArrowLeft') s -= 1
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      const col = rows[rowIndex].seats[seatIndex].col
      r += key === 'ArrowDown' ? 1 : -1
      if (!rows[r]) return
      // nearest seat by grid column in the next row
      s = rows[r].seats.reduce((best, seat, i) => (Math.abs(seat.col - col) < Math.abs(rows[r].seats[best].col - col) ? i : best), 0)
    }
    const target = rows[r]?.seats[s]
    if (!target) return
    setFocusId(target.id)
    buttons.current.get(target.id)?.focus()
  }

  return (
    <div className="seat-map" role="group" aria-label="Seat map">
      <div className="seat-screen" aria-hidden="true">
        Screen this way
      </div>
      <div className="seat-map-scroll">
        <div className="seat-rows" style={{ '--cols': maxCol }}>
          {rows.map((row, rowIndex) => (
            <div key={row.label} className="seat-row" role="group" aria-label={`Row ${row.label}`}>
              <span className="row-label" aria-hidden="true">
                {row.label}
              </span>
              <div className="seat-row-grid">
                {row.seats.map((seat, seatIndex) => {
                  const state = stateOf(seat, takenStates, selected)
                  const price = priceOf.get(seat.category)
                  const label = [
                    `Row ${row.label} seat ${seat.number}`,
                    price?.name ?? seat.category,
                    price?.amount !== undefined && formatPrice(price.amount),
                    seat.accessible && 'wheelchair accessible',
                    SEAT_STATE_LABELS[state],
                  ]
                    .filter(Boolean)
                    .join(', ')
                  const clickable = interactive && (state === 'available' || state === 'selected')
                  if (!interactive) {
                    // Read-only map: a labelled image per seat, not a button that does nothing.
                    return (
                      <span
                        key={seat.id}
                        role="img"
                        className={`seat seat-${state}${seat.accessible ? ' seat-accessible' : ''}`}
                        style={{ gridColumn: seat.col }}
                        aria-label={label}
                      >
                        <span aria-hidden="true">{seat.number}</span>
                      </span>
                    )
                  }
                  return (
                    <button
                      key={seat.id}
                      ref={(el) => (el ? buttons.current.set(seat.id, el) : buttons.current.delete(seat.id))}
                      type="button"
                      className={`seat seat-${state}${seat.accessible ? ' seat-accessible' : ''}`}
                      style={{ gridColumn: seat.col }}
                      data-category={seat.category}
                      aria-label={label}
                      aria-pressed={state === 'selected'}
                      aria-disabled={!clickable || undefined}
                      tabIndex={seat.id === focusId ? 0 : -1}
                      onClick={() => clickable && onToggle(seat.id)}
                      onFocus={() => setFocusId(seat.id)}
                      onKeyDown={(event) => {
                        if (event.key.startsWith('Arrow')) {
                          event.preventDefault()
                          moveFocus(rowIndex, seatIndex, event.key)
                        }
                      }}
                    >
                      <span aria-hidden="true">{seat.number}</span>
                    </button>
                  )
                })}
              </div>
              <span className="row-label" aria-hidden="true">
                {row.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <ul className="seat-legend" aria-label="Legend">
        {['available', ...(interactive ? ['selected', 'mine'] : []), 'held', 'booked', 'unavailable'].map((state) => (
          <li key={state}>
            <span className={`seat seat-${state} seat-sample`} aria-hidden="true" />
            {SEAT_STATE_LABELS[state][0].toUpperCase() + SEAT_STATE_LABELS[state].slice(1)}
          </li>
        ))}
        <li>
          <span className="seat seat-available seat-accessible seat-sample" aria-hidden="true" />
          Wheelchair accessible
        </li>
      </ul>
    </div>
  )
}
