import mongoose from 'mongoose';
import { env } from '../../src/config/env.js';
import { connectDB, disconnectDB } from '../../src/config/db.js';

function assertTestDatabase() {
  // Second line of defence after config/env.js: never wipe anything that isn't a *_test database.
  const name = mongoose.connection.name;
  if (!env.isTest || !name?.endsWith('_test')) {
    throw new Error(`Refusing to modify database "${name}": tests may only touch *_test databases`);
  }
}

export async function connectTestDB() {
  await connectDB(env.mongodbUri);
  assertTestDatabase();
}

/** Deletes every document in the test database. Call in beforeEach/after hooks. */
export async function clearTestDB() {
  assertTestDatabase();
  await mongoose.connection.db.dropDatabase();
}

export async function disconnectTestDB() {
  await disconnectDB();
}
