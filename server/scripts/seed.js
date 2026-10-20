// Development seed: `npm run seed` (from server/).
// Adds demo movies, theatres, screens and the next 7 days of showtimes to the database in MONGODB_URI.
// Safe to run repeatedly — it only adds what is missing. It never runs automatically on server start.
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { ensureIndexes } from '../src/models/index.js';
import { seedCatalogue } from '../src/seed/seedDatabase.js';

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
  console.log('Done. Existing records were left unchanged.');
} catch (err) {
  console.error(`Seeding failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
