// Development seed: `npm run seed` (from server/).
// Adds demo movies, theatres, screens and the next 14 days of showtimes (from today, IST) to the database in
// MONGODB_URI. Safe to run repeatedly — it only adds what is missing and never touches accounts or bookings, so
// re-running it before a demo tops the showtimes up. It never runs automatically on server start.
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { ensureIndexes } from '../src/models/index.js';
import { seedCatalogue, upcomingShowtimeSummary } from '../src/seed/seedDatabase.js';

if (env.isProduction) {
  console.error('Refusing to seed: NODE_ENV=production. Demo data is for development only.');
  process.exit(1);
}

try {
  const conn = await connectDB(env.mongodbUri);
  console.log(`Seeding database "${conn.name}"...`);
  await ensureIndexes();
  const created = await seedCatalogue();
  console.log('Created:', created);
  const { count, lastDate } = await upcomingShowtimeSummary();
  console.log(`Upcoming bookable showtimes: ${count}${lastDate ? `, the last on ${lastDate} (IST)` : ''}.`);
  console.log('Done. Existing records were left unchanged; run this again later to add showtimes for new dates.');
} catch (err) {
  console.error(`Seeding failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
