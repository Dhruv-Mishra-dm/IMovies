/** Escapes user text so it can be used inside a RegExp literally ("(" or ".*" lose their special meaning). */
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" match on user input, safe from regex injection. */
export function containsText(text) {
  return { $regex: escapeRegex(text), $options: 'i' };
}

/** Case-insensitive exact match on user input, e.g. "hindi" matches "Hindi". */
export function equalsText(text) {
  return { $regex: `^${escapeRegex(text)}$`, $options: 'i' };
}

/** Runs a paginated find and returns { items, page, pageSize, total, totalPages }. */
export async function paginate(model, filter, { page, pageSize, sort, select, populate }) {
  let query = model.find(filter).sort(sort).skip((page - 1) * pageSize).limit(pageSize);
  if (select) query = query.select(select);
  if (populate) query = query.populate(populate);
  const [items, total] = await Promise.all([query, model.countDocuments(filter)]);
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
