// A seat layout describes a screen's seats as rows on a grid:
//
// {
//   categories: [{ code: 'CLASSIC', name: 'Classic' }, { code: 'RECLINER', name: 'Recliner' }],
//   rows: [
//     { label: 'A', seats: [{ number: 1, col: 1, category: 'CLASSIC' }, { number: 2, col: 2, category: 'CLASSIC' }, ...] },
//   ]
// }
//
// - `col` is the seat's grid column, so leaving column numbers out creates an aisle.
// - `accessible: true` marks wheelchair-accessible seats.
// - `disabled: true` marks seats the cinema has taken out of service (never bookable).
// - A seat's id is row label + number, e.g. "A12".

export const MAX_COLUMNS = 60;
export const MAX_ROWS = 30;
export const MAX_SEATS = 1000;

const ROW_LABEL = /^[A-Z]{1,2}$/;
const CATEGORY_CODE = /^[A-Z][A-Z0-9_]{1,19}$/;

export const seatId = (rowLabel, number) => `${rowLabel}${number}`;

/** Returns a list of human-readable problems; an empty list means the layout is valid. */
export function validateSeatLayout(layout) {
  const problems = [];
  if (!layout || typeof layout !== 'object') return ['Layout is required'];

  const categories = Array.isArray(layout.categories) ? layout.categories : [];
  const rows = Array.isArray(layout.rows) ? layout.rows : [];

  if (categories.length === 0) problems.push('At least one seat category is required');
  const codes = new Set();
  for (const category of categories) {
    if (!CATEGORY_CODE.test(category?.code ?? '')) {
      problems.push(`Category code "${category?.code}" must be 2-20 uppercase letters, digits or _`);
    } else if (codes.has(category.code)) {
      problems.push(`Duplicate category code ${category.code}`);
    }
    if (!category?.name?.trim?.()) problems.push(`Category ${category?.code} needs a name`);
    codes.add(category?.code);
  }

  if (rows.length === 0) problems.push('At least one row is required');
  if (rows.length > MAX_ROWS) problems.push(`At most ${MAX_ROWS} rows are allowed`);

  const labels = new Set();
  const usedCategories = new Set();
  let seatCount = 0;

  for (const row of rows) {
    const label = row?.label;
    if (!ROW_LABEL.test(label ?? '')) {
      problems.push(`Row label "${label}" must be 1-2 uppercase letters`);
      continue;
    }
    if (labels.has(label)) problems.push(`Duplicate row ${label}`);
    labels.add(label);

    const seats = Array.isArray(row.seats) ? row.seats : [];
    if (seats.length === 0) problems.push(`Row ${label} has no seats`);
    const numbers = new Set();
    const cols = new Set();
    for (const seat of seats) {
      seatCount += 1;
      const where = `Seat ${label}${seat?.number}`;
      if (!Number.isInteger(seat?.number) || seat.number < 1 || seat.number > 99) {
        problems.push(`${where}: number must be 1-99`);
      } else if (numbers.has(seat.number)) {
        problems.push(`${where}: duplicate seat number`);
      }
      if (!Number.isInteger(seat?.col) || seat.col < 1 || seat.col > MAX_COLUMNS) {
        problems.push(`${where}: column must be 1-${MAX_COLUMNS}`);
      } else if (cols.has(seat.col)) {
        problems.push(`${where}: column ${seat.col} is already used in row ${label}`);
      }
      if (!codes.has(seat?.category)) problems.push(`${where}: unknown category "${seat?.category}"`);
      numbers.add(seat?.number);
      cols.add(seat?.col);
      usedCategories.add(seat?.category);
    }
  }

  if (seatCount > MAX_SEATS) problems.push(`At most ${MAX_SEATS} seats are allowed`);
  if (seatCount > 0 && !layout.rows.some((r) => r.seats?.some((s) => !s.disabled))) {
    problems.push('At least one seat must be bookable');
  }
  for (const code of codes) {
    if (!usedCategories.has(code)) problems.push(`Category ${code} is not used by any seat`);
  }
  return problems;
}

/** Map of seatId → seat (with row label) for quick lookups. */
export function indexSeats(layout) {
  const map = new Map();
  for (const row of layout.rows) {
    for (const seat of row.seats) {
      map.set(seatId(row.label, seat.number), { ...seat, row: row.label, id: seatId(row.label, seat.number) });
    }
  }
  return map;
}

/** Number of seats that can actually be sold. */
export function bookableCapacity(layout) {
  let count = 0;
  for (const row of layout.rows) for (const seat of row.seats) if (!seat.disabled) count += 1;
  return count;
}

/**
 * Convenience builder used by seed data and the admin layout form:
 * rows: [{ label: 'A', category: 'CLASSIC', seats: 12, aisleAfter: [4, 8], accessible: [1, 2], disabled: [] }]
 * Each aisle leaves one empty grid column after the given seat number.
 */
export function buildLayout({ categories, rows }) {
  return {
    categories,
    rows: rows.map((row) => {
      const aisles = new Set(row.aisleAfter ?? []);
      const accessible = new Set(row.accessible ?? []);
      const disabled = new Set(row.disabled ?? []);
      const seats = [];
      let col = row.offset ? row.offset + 1 : 1;
      for (let number = 1; number <= row.seats; number += 1) {
        seats.push({
          number,
          col,
          category: row.category,
          ...(accessible.has(number) && { accessible: true }),
          ...(disabled.has(number) && { disabled: true }),
        });
        col += aisles.has(number) ? 2 : 1;
      }
      return { label: row.label, seats };
    }),
  };
}
