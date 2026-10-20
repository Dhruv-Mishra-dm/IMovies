import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './config/logger.js';
import healthRoutes from './routes/health.routes.js';
import { notFound, errorHandler } from './middleware/errorHandlers.js';

// Building the app in a function (separate from listen()) lets tests use it without opening a port.
export function createApp({ clientOrigin }) {
  const app = express();

  app.disable('x-powered-by');

  // One structured log line per request, tagged with a request id that is also returned
  // in the X-Request-Id header and in error bodies, so a user-visible error can be found in the logs.
  // Headers are deliberately not logged (they carry cookies).
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(helmet());
  // Only our React app may call the API from a browser. `credentials: true` lets the
  // httpOnly auth cookie (added in the auth epic) travel with requests.
  // Unknown origins get no CORS headers at all, so the browser blocks them.
  // Requests with no Origin (curl, server-to-server) aren't affected by CORS anyway.
  const allowedOrigins = new Set([clientOrigin]);
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
      credentials: true,
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
