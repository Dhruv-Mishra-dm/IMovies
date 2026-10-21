import path from 'node:path';
import express from 'express';
import helmet from 'helmet';

/**
 * Serves the built React app (client/dist) from the API's own origin, so cookies, the Origin check and
 * WebSockets work exactly as in development. Unknown non-API paths fall back to index.html so that
 * client-side routes like /movies/the-monsoon-cipher work on reload.
 */
export function staticSite(distDir) {
  const router = express.Router();

  // The page's own Content Security Policy: only this origin's scripts; images from this site and https
  // (admins may use https poster URLs); styles may be inline (React style attributes, toast styles).
  router.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"], // API calls and the Socket.IO connection (same origin, incl. wss:)
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    }),
  );

  // Hashed asset files never change, so browsers may cache them for a year; index.html must not be cached.
  router.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );

  router.get(/^(?!\/api\/|\/socket\.io\/).*/, (req, res, next) => {
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
  return router;
}
