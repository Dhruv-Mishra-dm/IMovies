import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';

async function start() {
  try {
    const conn = await connectDB(env.mongodbUri);
    console.log(`MongoDB connected: ${conn.host}:${conn.port}/${conn.name}`);
  } catch (err) {
    console.error(`Could not connect to MongoDB: ${err.message}`);
    console.error('Is Docker Desktop running? Try: docker compose up -d');
    process.exit(1);
  }

  const app = createApp({ clientOrigin: env.clientOrigin });
  const server = app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Close the HTTP server and DB connection cleanly on Ctrl+C / container stop.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
