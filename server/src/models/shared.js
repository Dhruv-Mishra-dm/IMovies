// Options shared by every schema.

/** JSON output: expose `id` instead of `_id`, hide the internal `__v` version key. */
export const jsonOptions = {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    delete ret._id;
    return ret;
  },
};

export const schemaOptions = { timestamps: true, toJSON: jsonOptions, toObject: jsonOptions };

// Characters that could break out of a CSS url("…") or an HTML attribute; never needed in real image URLs.
export const UNSAFE_URL_CHARS = /["'()<>\\\s`]/;

/** Image URLs: either https://… or a site-relative path such as /posters/x.svg (bundled with the client). */
export function isImageUrl(value) {
  if (value === undefined || value === null || value === '') return true;
  if (UNSAFE_URL_CHARS.test(value)) return false;
  if (/^\/[a-z0-9/_.-]+$/i.test(value) && !value.includes('..')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isHttpsUrl(value) {
  if (value === undefined || value === null || value === '') return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** URL-safe identifier, e.g. "the-monsoon-cipher". */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
