// Creates an administrator, or promotes an existing user to administrator.
//
// PowerShell (values exist only for this terminal session, nothing is written to disk):
//   $env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="<a strong password>"; $env:ADMIN_NAME="Site Admin"
//   npm run create-admin
//   Remove-Item Env:ADMIN_PASSWORD
//
// - New email  → creates an admin with that password.
// - Existing user → promoted to admin; their password is NOT changed; their sessions are revoked
//   so the new role applies on next login.
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { ensureIndexes, User, ROLES, normalizeEmail } from '../src/models/index.js';
import { hashPassword, revokeAllSessions } from '../src/services/authService.js';
import { password as passwordRule } from '../src/validators/auth.js';

const email = process.env.ADMIN_EMAIL ? normalizeEmail(process.env.ADMIN_EMAIL) : '';
const plainPassword = process.env.ADMIN_PASSWORD ?? '';
const name = (process.env.ADMIN_NAME ?? 'Administrator').trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Set ADMIN_EMAIL to a valid email address.');
  process.exit(1);
}

try {
  await connectDB(env.mongodbUri);
  await ensureIndexes();
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role === ROLES.ADMIN) {
      console.log(`${email} is already an administrator. Nothing changed.`);
    } else {
      existing.role = ROLES.ADMIN;
      await existing.save();
      await revokeAllSessions(existing._id);
      console.log(`Promoted existing user ${email} to administrator (password unchanged; please log in again).`);
    }
  } else {
    const check = passwordRule.safeParse(plainPassword);
    if (!check.success) {
      console.error(`ADMIN_PASSWORD ${check.error.issues[0].message}.`);
      process.exitCode = 1;
    } else {
      await User.create({ name, email, passwordHash: await hashPassword(plainPassword), role: ROLES.ADMIN });
      console.log(`Created administrator ${email}.`);
    }
  }
} catch (err) {
  console.error(`Failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
