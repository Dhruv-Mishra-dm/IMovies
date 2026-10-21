# Architecture and design notes

This document explains how IMovies is put together and why. For setup and usage see the
[README](../README.md); for endpoints see [API.md](API.md).

## System overview

```
Browser (React SPA)  ── HTTP /api ──►  Express API  ── Mongoose ──►  MongoDB (replica set)
        ▲                                   │
        └──── Socket.IO /socket.io ◄────────┘   seat updates, published only after a commit
```

- The browser always talks to **one origin**. In development Vite serves the app on port 5173 and
  proxies `/api` and `/socket.io` to the API on port 5000. In production the API can serve the built
  app itself (`CLIENT_DIST_DIR`, see [DEPLOYMENT.md](DEPLOYMENT.md)). Same origin keeps the
  `SameSite=Strict` cookies, the Origin check and WebSockets simple.
- The API is layered: `routes/` (URLs, validation middleware) → `controllers/` (HTTP in and out) →
  `services/` (business rules, transactions) → `models/` (schemas and indexes). Controllers only read
  validated input (`req.validated`).
- **The server is the authority** for seat availability, prices, booking and payment status,
  cancellation eligibility and permissions. The client only displays state and sends intents.

## Business rules

These are code constants in `server/src/config/business.js`, not environment variables, so a
misconfigured deployment can't silently change them. Comments in the code refer to them by number.

| # | Rule |
|---|---|
| 1 | Sessions use 15-minute access tokens and **rotating 7-day refresh tokens**. Each refresh issues a new refresh token; reusing an old one revokes the whole token family. |
| 2 | A customer may cancel a confirmed booking **at least 120 minutes** before the show and gets a **full simulated refund**; no cancellation after that. |
| 3 | Currency **INR**, stored as **integer paise**; business time zone **Asia/Kolkata**; **no taxes or fees** — a booking total is the sum of its seat prices. |
| 4 | A **failed simulated payment can be retried** while the **10-minute seat hold** is valid; once it expires the seats are released and payment is refused. |
| 5 | When an admin **cancels a showtime**, every affected booking is cancelled and **simulated refunds** are recorded for paid ones, exactly once each. |

Other defaults in the same file: 15 minutes of turnaround after every show, at most 10 seats per booking.

## Data model

| Collection | Purpose | Key constraints / indexes |
|---|---|---|
| `users` | Customers and admins | unique `email` (stored lower-case); `passwordHash` excluded by default; `tokenVersion` for revocation |
| `refreshsessions` | One per issued refresh token (hash only) | unique `tokenHash`; `familyId` for reuse revocation; TTL on `expiresAt` |
| `movies` | Catalogue; `DRAFT` → `PUBLISHED` ↔ `ARCHIVED` | unique `slug`; `(status, releaseDate)`, `(status, genres, releaseDate)` |
| `theatres` | Cinemas | unique `slug`; `(city, isActive)` |
| `screens` | Screens with their seat layout (rows on a grid, categories, accessible/out-of-service seats) | unique `(theatre, name)`; `scheduleVersion` serialises scheduling |
| `showtimes` | A movie on a screen at a time, with a **copy of the seat map** and prices per category (paise) | `(screen, startsAt)`, `(movie, status, startsAt)`, `(theatre, status, startsAt)`; `lockVersion` |
| `seatreservations` | One document per **taken** seat of a show (`HELD` with expiry, or `BOOKED`) | **unique `(showtime, seatId)`** — the double-booking guarantee; TTL backstop |
| `bookings` | Bookings with a snapshot of movie, theatre, show and seat prices | unique `reference`; partial unique `(user, showtime)` where `HELD` (one active hold) |
| `payments` | One per payment attempt (simulated; no card data) | unique `(user, idempotencyKey)`; partial unique `booking` where `PENDING`; partial unique `booking` where captured |
| `refunds` | Simulated refunds | unique `payment` (no double refund) |
| `auditlogs` | Admin actions | `(entityType, entityId, createdAt)` |

Indexes are created explicitly by `ensureIndexes()` at start-up and in tests (Mongoose auto-indexing is
off), so a request is never served before the constraints exist.

**Seat inventory.** Free seats have no document; only taken seats are stored in `seatreservations`.
Two alternatives were rejected: embedding all seat states in the showtime document (every booking would
rewrite one hot document, so bookings of *different* seats would conflict, and per-seat expiry inside
arrays is awkward), and pre-creating one document per seat per show (thousands of documents that never
change). Each showtime keeps its own copy of the screen layout, so editing a screen never changes seats
that were already sold.

**State machines** (`server/src/domain/statuses.js`):

- Booking: `HELD → CONFIRMED | EXPIRED | RELEASED | CANCELLED`, `CONFIRMED → CANCELLED`
- Payment: `PENDING → SUCCEEDED | FAILED | VOIDED`, `SUCCEEDED → REFUNDED`
- Showtime: `SCHEDULED → CANCELLED` ("started" and "completed" are derived from the clock, not stored)
- Movie: `DRAFT → PUBLISHED | ARCHIVED`, `PUBLISHED → ARCHIVED`, `ARCHIVED → PUBLISHED`

Transitions are conditional updates (`updateOne({ _id, status: 'HELD' }, …)`), so two concurrent
requests can't both perform the same transition.

**Time and money.** Instants are stored in UTC; `utils/time.js` converts IST wall-clock input and groups
by IST calendar day. Money is integer paise (`utils/money.js`). Business rules read the time from
`utils/clock.js`, which tests move forward instead of sleeping.

## Concurrency

A transaction alone does not stop two "check, then insert" flows from both succeeding; a document that
both writers must modify, or a unique index, does. IMovies uses both:

- **Seat holds** run in one transaction that (1) increments the showtime's `lockVersion` — serialising
  holds for that show and failing if the show was cancelled or has started — (2) expires any overdue
  holds on the requested seats, and (3) inserts the `HELD` booking and one reservation per seat. The
  unique `(showtime, seatId)` index makes a second reservation impossible; any conflict rolls back the
  whole hold (no partial holds) and is reported as `409 SEATS_UNAVAILABLE` with the taken seats.
- **Scheduling** increments `Screen.scheduleVersion` before the overlap check (including turnaround), so
  two admins scheduling the same screen at once can't both succeed.
- **Payments** are idempotent per `(user, Idempotency-Key)`; partial unique indexes allow only one
  pending attempt and one captured payment per booking.
- **Refunds** are unique per payment, so repeated or simultaneous cancellations refund once.

Tests exercise these paths concurrently, for example 20 customers racing for one seat (exactly one
hold), overlapping multi-seat requests (no partial holds), five simultaneous overlapping schedules
(exactly one created) and racing payment attempts (exactly one capture).

## Authentication and authorization

- Passwords: bcrypt (cost 12; 8–72 bytes with a letter and a digit — bcrypt ignores bytes beyond 72).
  Login compares against a dummy hash for unknown emails, and wrong password and unknown email return
  the same error.
- Access token: HS256 JWT (algorithm pinned, issuer and audience checked), 15 minutes, in an httpOnly
  cookie. Refresh token: 256 random bits in an httpOnly cookie scoped to `/api/auth`, stored only as a
  SHA-256 hash. Cookies are `SameSite=Strict` and `Secure` in production.
- Every refresh rotates the token. A rotated token presented again revokes the whole family. A reuse
  within 10 seconds is answered with `409 REFRESH_CONFLICT` instead (two tabs refreshing at once) — a
  deliberate trade-off.
- The user and its `tokenVersion` are reloaded on every request, so a role change, password change or
  "log out everywhere" takes effect immediately.
- CSRF: every state-changing request must carry an `Origin` (or `Referer`) equal to `CLIENT_ORIGIN`.
  CORS allows only that origin, and Socket.IO accepts connections only from it.
- Roles: public sign-up always creates customers; administrators are created by `npm run create-admin`.
  Admin routers are guarded on the server. Other customers' bookings return 404 rather than 403.
- The React client refreshes the session once on a 401 and retries the request once (a single shared
  refresh; no loops).

## Payments, cancellations and refunds

The payment provider is simulated (`services/payments/simulatedProvider.js`) behind an
`authorize` / `capture` / `void` / `refund` interface. The customer chooses the demo outcome; the server
decides the amount and records the result.

1. A payment attempt is authorised, then the booking is confirmed in a transaction (booking
   `CONFIRMED`, seats `BOOKED`, payment `SUCCEEDED`) only if the hold is still valid and the show still
   open, and only then captured. If confirmation fails, the authorisation is voided and nothing is
   announced as booked.
2. Customer cancellation checks the 120-minute cutoff against the show's current start time, cancels the
   booking, frees its seats and records a `PENDING` refund inside the transaction; the provider refund
   runs after commit and is retried if it fails.
3. Admin show cancellation first marks the show cancelled (no new holds or payments can commit), then
   cancels each booking in its own transaction. The outcome (`COMPLETED` or `PARTIAL`, with counts) is
   stored on the show and in the audit log; repeating the request finishes remaining bookings.
4. A background job (`jobs/holdSweeper.js`, every 15 s, safe on several instances) expires holds, fails
   interrupted payments, retries failed refunds and resumes interrupted show cancellations. Correctness
   never depends on it: expired holds are also cleared lazily by every booking operation.

## Real-time updates

- Domain events (`events/bus.js`) are published only **after** the transaction commits and forwarded to
  Socket.IO rooms (`sockets/realtime.js`): one room per show for seat changes, one per user for
  personal booking updates.
- Clients can only listen. Joining a show requires a real, published showtime; joins are rate-limited
  (30 per minute) and a socket can watch at most 3 shows.
- Events are hints. The seat page applies them immediately, refetches the authoritative seat list
  shortly after, and refetches again after every reconnection, so missed or duplicated events can't leave
  a stale map. The client reconnects the socket when the logged-in user changes.

## Error handling and logging

- Every error response has the same shape: `{ "error": { "code", "message", "details?", "requestId" } }`.
  Unexpected errors return only "Internal server error"; details go to the log.
- Logs are structured (pino) with a request id per request (also returned in `X-Request-Id`). Passwords,
  tokens and cookies are redacted; request headers are not logged.
- Environment variables are validated with zod at start-up; invalid configuration stops the server and
  names the variable without printing its value. Production additionally requires `Secure` cookies and
  bcrypt cost ≥ 12.
- `/api/health` returns 200 only when MongoDB is connected and writable (the replica-set primary).

## Technical decisions

| Decision | Choice | Reason |
|---|---|---|
| Database | MongoDB 8 single-node replica set in Docker, bound to 127.0.0.1 | Multi-document transactions require a replica set; local-only binding means no credentials are needed in development |
| Env loading | Node's `process.loadEnvFile` | Same behaviour as `dotenv` without the dependency (Node ≥ 22) |
| Validation | zod; controllers read `req.validated` | Unknown fields are stripped (mass assignment) and operator objects rejected (NoSQL injection) |
| Logging | pino + pino-http (pino-pretty in development) | Structured JSON with built-in redaction |
| Backend tests | `node:test` + Supertest against a real test database | No extra runner; transactions and indexes are tested for real |
| Frontend tests | Vitest + React Testing Library + jsdom | Shares the Vite configuration |
| Linting | oxlint | ESLint-compatible rules, much faster; came with the Vite scaffold |
| Frontend HTTP | axios instance returning `{ ok, status, data, kind }` | One place for session refresh and error handling |

## Testing strategy

- **Backend** (`server/tests`, run with `npm test`): API tests through Supertest against a dedicated
  test database, model and index constraint tests, concurrency tests, security probes (injection,
  CSRF, CORS, headers, authorization boundaries), Socket.IO tests against a real server, and seed tests.
  Time-dependent rules use the controllable clock. A guard refuses to run unless `MONGODB_URI_TEST`
  ends in `_test` and differs from `MONGODB_URI`.
- **Frontend** (`client/src/**/*.test.jsx`, run with `npm test`): page-level tests that render the real
  routes with mocked API modules and a fake socket, plus unit tests for utilities and the API client.
- There is no automated browser end-to-end suite; full flows were checked manually during development.
