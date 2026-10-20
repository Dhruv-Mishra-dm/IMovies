import mongoose from 'mongoose';

// Reject queries on fields that aren't in the schema instead of silently ignoring them.
mongoose.set('strictQuery', true);

export async function connectDB(uri) {
  // Fail fast (5s) with a clear error instead of hanging if MongoDB isn't running.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

// Live check used by the health endpoint. readyState alone can be stale,
// so we also send a real `hello` command to the server.
export async function getDbStatus() {
  const conn = mongoose.connection;
  if (conn.readyState !== 1) {
    return { connected: false, state: mongoose.STATES[conn.readyState] };
  }
  try {
    const hello = await conn.db.admin().command({ hello: 1 });
    return {
      connected: true,
      state: 'connected',
      name: conn.name,
      replicaSet: hello.setName ?? null,
      // Transactions need a replica set (or sharded cluster).
      transactionsSupported: Boolean(hello.setName),
    };
  } catch {
    return { connected: false, state: 'unreachable' };
  }
}
