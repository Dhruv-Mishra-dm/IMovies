import mongoose from 'mongoose';
import { env } from '../../src/config/env.js';
import { connectDB, disconnectDB } from '../../src/config/db.js';
import { ensureIndexes } from '../../src/models/index.js';

function assertTestDatabase() {
  // Second line of defence after config/env.js: never wipe anything that isn't a *_test database.
  const name = mongoose.connection.name;
  if (!env.isTest || !name?.endsWith('_test')) {
    throw new Error(`Refusing to modify database "${name}": tests may only touch *_test databases`);
  }
}

/** Connects to the guarded test database and makes sure every collection and index exists. */
export async function connectTestDB() {
  await connectDB(env.mongodbUri);
  assertTestDatabase();
  await ensureIndexes();
}

/**
 * Deletes every document in the test database but keeps collections and indexes
 * (the unique indexes are part of what the tests verify). Call in beforeEach hooks.
 */
export async function clearTestDB() {
  assertTestDatabase();
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function disconnectTestDB() {
  await disconnectDB();
}
