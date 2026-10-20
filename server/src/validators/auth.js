import { z } from 'zod';

// bcrypt only looks at the first 72 BYTES of a password, so longer passwords are rejected
// instead of being silently truncated. (A non-ASCII character can use up to 4 bytes.)
export const password = z
  .string()
  .min(8, 'must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'must be at most 72 bytes')
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), 'must contain at least one letter and one number');

const email = z.string().trim().toLowerCase().pipe(z.email('must be a valid email address').max(254));
const name = z.string().trim().min(1, 'is required').max(80, 'must be at most 80 characters');

// z.object() drops unknown keys, so a client sending { role: 'admin' } is simply ignored.
export const registerBody = z.object({ name, email, password });

// Login doesn't apply the password policy (old passwords might predate it) — only basic bounds.
export const loginBody = z.object({ email, password: z.string().min(1, 'is required').max(200) });

export const updateProfileBody = z.object({ name });

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'is required').max(200),
  newPassword: password,
});
