# Deployment notes

IMovies has not been deployed. This page describes how the code is prepared for a production setup and
what a deployment would need.

## Recommended shape: one Node service and a hosted replica set

The API can serve the built React app from its own origin, so the `SameSite=Strict` cookies, the
Origin check and WebSockets work exactly as in development.

1. **Database.** Use a MongoDB deployment that is a replica set (transactions require it), for example a
   MongoDB Atlas cluster. Create a dedicated database user, restrict network access and use a URI such
   as `mongodb+srv://<user>:<password>@<cluster-host>/imovies?retryWrites=true`.
2. **Build the frontend:** in `client/`, run `npm ci` and `npm run build` (creates `client/dist`).
3. **Run the API** on a host that supports long-running Node processes and WebSockets: in `server/`, run
   `npm ci --omit=dev` and `npm start`, with the environment set in the host (never in a committed file):

   | Variable | Production value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | the database URI (secret) |
   | `CLIENT_ORIGIN` | the public origin, e.g. `https://imovies.example.com` |
   | `JWT_ACCESS_SECRET` | a new random value, never reused from development |
   | `CLIENT_DIST_DIR` | path to the built `client/dist` |
   | `TRUST_PROXY` | number of proxies in front of the app (usually `1` on hosting platforms) |
   | `PORT` | usually provided by the host |

   With `NODE_ENV=production` the server refuses to start with insecure cookies or a bcrypt cost below
   12, and the seed script refuses to run. With `CLIENT_DIST_DIR` set it serves the site with a strict
   Content-Security-Policy, long-lived caching for hashed assets, `no-cache` for `index.html`, and an
   SPA fallback that never intercepts `/api` or `/socket.io`.
4. **HTTPS is required** because cookies are `Secure` in production. On a plain VM, put a reverse proxy
   (for example Caddy or Nginx) in front and forward WebSocket upgrades for `/socket.io`.
5. **First administrator:** run `npm run create-admin` once against the production environment.

## Separate frontend hosting

Hosting the static site and the API on different hosts needs both on the same *site* (for example
`www.example.com` and `api.example.com` behind a reverse-proxy rewrite) or changes to the cookie and
Origin configuration. Many static-host rewrites don't proxy WebSockets, in which case Socket.IO falls
back to long-polling. The single-service shape avoids these issues.

## Running more than one API instance

- Rate limits use an in-memory store, so they are per process; several instances need a shared store
  (for example Redis).
- Real-time events are broadcast within one process; several instances need a Socket.IO adapter (for
  example the Redis adapter).
- The background jobs are already safe to run on several instances (every step is a conditional update).
