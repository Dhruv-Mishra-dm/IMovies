import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import healthRoutes from './routes/health.routes.js';
import { notFound, errorHandler } from './middleware/errorHandlers.js';

// Building the app in a function (separate from listen()) lets tests use it without opening a port.
export function createApp({ clientOrigin }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // Only our React app may call the API from a browser. `credentials: true` lets the
  // httpOnly auth cookie (added in Epic 1) travel with requests.
  // Unknown origins get no CORS headers at all, so the browser blocks them.
  // Requests with no Origin (curl, server-to-server) aren't affected by CORS anyway.
  const allowedOrigins = new Set([clientOrigin]);
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
