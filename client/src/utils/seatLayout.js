// Client-side twin of server/src/domain/seatLayout.js buildLayout(): the admin layout editor works with
// simple row descriptions and turns them into the stored layout. The SERVER validates the result again.

/** "3, 11" → [3, 11]; ignores blanks and non-numbers. */
export function parseNumberList(text) {
  return String(text ?? '')
    .split(/[\s,]+/)
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0)
}

/** rows: [{ label, category, seats, aisleAfter, accessible, disabled, offset }] → stored layout rows */
export function buildLayout({ categories, rows }) {
  return {
    categories,
    rows: rows.map((row) => {
      const aisles = new Set(row.aisleAfter ?? [])
      const accessible = new Set(row.accessible ?? [])
      const disabled = new Set(row.disabled ?? [])
      const seats = []
      let col = (row.offset ?? 0) + 1
      for (let number = 1; number <= row.seats; number += 1) {
        seats.push({
          number,
          col,
          category: row.category,
          ...(accessible.has(number) && { accessible: true }),
          ...(disabled.has(number) && { disabled: true }),
        })
        col += aisles.has(number) ? 2 : 1
      }
      return { label: row.label, seats }
    }),
  }
}

/** The reverse, to edit an existing layout. Rows are assumed to use one category each (as the editor creates). */
export function describeLayout(layout) {
  return layout.rows.map((row) => {
    const seats = [...row.seats].sort((a, b) => a.number - b.number)
    const aisleAfter = []
    for (let i = 0; i < seats.length - 1; i += 1) if (seats[i + 1].col - seats[i].col > 1) aisleAfter.push(seats[i].number)
    return {
      label: row.label,
      category: seats[0]?.category ?? layout.categories[0]?.code,
      seats: seats.length,
      offset: Math.max(0, (seats[0]?.col ?? 1) - 1),
      aisleAfter,
      accessible: seats.filter((s) => s.accessible).map((s) => s.number),
      disabled: seats.filter((s) => s.disabled).map((s) => s.number),
    }
  })
}

/** Rupees as typed ("250", "250.50") → integer paise, or null if invalid. */
export function rupeesToPaise(text) {
  const value = String(text ?? '').trim()
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export const paiseToRupees = (paise) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2))
