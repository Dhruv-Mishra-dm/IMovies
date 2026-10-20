import mongoose from 'mongoose';

// Reject queries on fields that aren't in the schema instead of silently ignoring them.
mongoose.set('strictQuery', true);
// By default Mongoose queues queries for up to 10s while disconnected. We'd rather fail fast
// (the error handler turns it into a 500 and /api/health reports 503) than hang requests.
mongoose.set('bufferCommands', false);
// Indexes are created explicitly by models/index.js ensureIndexes() before the server accepts requests,
// instead of Mongoose building them in the background where a request could race ahead of them.
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const HEALTH_PROBE_TIMEOUT_MS = 2000;

export async function connectDB(uri) {
  // Fail fast (5s) with a clear error instead of hanging if MongoDB isn't running.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Live check used by the health endpoint. readyState alone can be stale,
// so we also send a real `hello` command to the server.
export async function getDbStatus() {
  const conn = mongoose.connection;
  if (conn.readyState !== 1) {
    return { connected: false, writable: false, state: mongoose.STATES[conn.readyState] };
  }
  try {
    const hello = await withTimeout(conn.db.admin().command({ hello: 1 }), HEALTH_PROBE_TIMEOUT_MS);
    return {
      connected: true,
      // Only a primary accepts writes; bookings are impossible without one.
      writable: Boolean(hello.isWritablePrimary),
      state: hello.isWritablePrimary ? 'connected' : 'not-primary',
      name: conn.name,
      replicaSet: hello.setName ?? null,
      // Transactions need a replica set (or sharded cluster).
      transactionsSupported: Boolean(hello.setName),
    };
  } catch (err) {
    return { connected: false, writable: false, state: err.message === 'timeout' ? 'timeout' : 'unreachable' };
  }
}
