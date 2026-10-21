# IMovies

A cinema booking system: customers find a showtime, pick exact seats on a live seat map, hold them for
ten minutes and pay with a simulated payment; administrators manage the catalogue, cinemas, seat
layouts and schedules.

Built with React, Node.js/Express, MongoDB and Socket.IO.

> Payments are simulated. There is no payment gateway, no card details are requested and no money moves.

## Why

Seat booking is a small domain with real consistency problems: two people clicking the same seat,
payments that succeed after a hold expired, refunds that must happen exactly once, and seat maps that go
stale while someone else books. IMovies implements those rules on the server — with transactions, unique
indexes and idempotency keys — and keeps every browser's seat map current through real-time events.

## Features

**Customers**
- Register, log in, log out (including "log out everywhere"), rename the account, change the password.
- Browse, search and filter movies (genre, language, now showing / coming soon); movie detail pages.
- Theatres by city; showtimes by date, theatre and city in Indian Standard Time, with seats-left hints.
- Seat map built from each screen's layout: seat categories and prices, aisles, wheelchair-accessible and
  out-of-service seats, keyboard navigation, live updates while other customers book.
- 10-minute seat hold with a countdown, simulated payment (approve or decline), retry after a declined
  payment, confirmation page with a booking reference.
- Booking history (upcoming / past and cancelled) and cancellation with a full simulated refund up to two
  hours before the show.

**Administrators**
- Dashboard computed from booking data: revenue and refunds, tickets sold, occupancy, top movies, recent
  bookings.
- Movies: create (as draft), edit, publish, archive, delete unscheduled drafts.
- Theatres and screens, including a seat-layout editor with a live preview.
- Showtimes: schedule (overlapping shows on a screen are refused), edit prices, cancel a show — every
  affected booking is cancelled and paid ones are refunded.
- Booking lookup by reference, customer or status, with payment and refund history.

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React 19, Vite 8, React Router 7, axios, Socket.IO client, react-toastify, plain CSS with design tokens |
| Backend | Node.js (22.12+), Express 5, Mongoose 9, Socket.IO 4, zod, pino, helmet, express-rate-limit, bcryptjs, jsonwebtoken |
| Database | MongoDB 8 as a single-node replica set (Docker Compose) — required for multi-document transactions |
| Testing and tooling | Node's test runner + Supertest (backend), Vitest + React Testing Library + jsdom (frontend), oxlint |

## Architecture

```
Browser (React SPA)  ── HTTP /api ──►  Express API  ── Mongoose ──►  MongoDB (replica set)
        ▲                                   │
        └──── Socket.IO /socket.io ◄────────┘   seat updates, published only after a commit
```

- The browser talks to a single origin. In development Vite (port 5173) proxies `/api` and `/socket.io` to
  the API (port 5000); in production the API can serve the built frontend itself.
- The API is layered as routes (validation) → controllers → services (business rules, transactions) →
  Mongoose models. The server is the authority for availability, prices, payment results, cancellation
  eligibility and permissions.
- Domain events are emitted only after a transaction commits and are forwarded to Socket.IO rooms (one
  per show, one per user). Clients treat them as hints and refetch the authoritative state.

Design details — data model, indexes, state machines, concurrency and the business rules — are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prerequisites

- Node.js 22.12 or newer (developed on 24) and npm 10+
- Docker with Docker Compose (Docker Desktop on Windows and macOS), running
- Git

The commands below are for PowerShell on Windows; macOS/Linux equivalents are given where they differ.

## Getting started

### 1. Start MongoDB

```sh
docker compose up -d
docker compose ps        # wait until the mongo service shows "(healthy)", usually 10–20 s
```

The container runs a one-member replica set bound to `127.0.0.1` only, with data in a named Docker
volume (`docker compose stop` keeps it; `docker compose down -v` deletes it).

### 2. Configure and install the API

```powershell
cd server
npm install
Copy-Item .env.example .env          # macOS/Linux: cp .env.example .env
```

`server/.env` is ignored by Git. Replace the `JWT_ACCESS_SECRET` placeholder — the server refuses to
start with it — using a generated value:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Paste the output into `.env` as `JWT_ACCESS_SECRET=<value>`. The other defaults work for local development.

### 3. Add demo data (optional)

```sh
npm run seed             # in server/
```

Adds fictional movies, four theatres with six screens and showtimes for the next 14 days (IST). It only
inserts missing records — re-running it later tops up showtimes without duplicating or overwriting
anything, and it never touches accounts or bookings. It refuses to run with `NODE_ENV=production`.

### 4. Install the frontend

```sh
cd ../client
npm install
```

### 5. Run

In two terminals, from the repository root:

```sh
# terminal 1 — API on http://localhost:5000 (restarts on file changes)
cd server
npm run dev
```

```sh
# terminal 2 — app on http://localhost:5173
cd client
npm run dev
```

Open **http://localhost:5173**. Use `localhost`, not `127.0.0.1`: state-changing requests must come from
`CLIENT_ORIGIN`. The footer's *System status* page reports whether the API and database are healthy.

### 6. Create an administrator

Public sign-up only creates customers. Create or promote an administrator with the script, passing the
values through environment variables of the current shell only:

```powershell
cd server
$env:ADMIN_EMAIL = "admin@example.com"; $env:ADMIN_NAME = "Site Admin"
$env:ADMIN_PASSWORD = "<a strong password>"      # 8+ characters with a letter and a number
npm run create-admin
Remove-Item Env:ADMIN_PASSWORD, Env:ADMIN_EMAIL, Env:ADMIN_NAME
```

On macOS/Linux: `ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… npm run create-admin`. Promoting an existing
customer keeps their password and ends their sessions. Administrators manage the site but can't book.

## Configuration

Server variables (`server/.env`, template in [`server/.env.example`](server/.env.example)). Invalid or
missing values stop the server with a message naming the variable, never its value.

| Variable | Required | Default / example | Purpose |
|---|---|---|---|
| `MONGODB_URI` | yes | `mongodb://127.0.0.1:27017/imovies?replicaSet=rs0` | Application database (must be a replica set) |
| `MONGODB_URI_TEST` | for tests | `mongodb://127.0.0.1:27017/imovies_test?replicaSet=rs0` | Test database; must end in `_test` and differ from `MONGODB_URI` |
| `CLIENT_ORIGIN` | yes | `http://localhost:5173` | The frontend origin, allowed by CORS, the Origin check and Socket.IO |
| `JWT_ACCESS_SECRET` | yes | — | Signs access tokens; at least 32 characters, generated per environment |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `PORT` | no | `5000` | API port |
| `BCRYPT_COST` | no | `12` | Password hashing cost (≥ 12 required in production) |
| `COOKIE_SECURE` | no | `false` in development, `true` in production | HTTPS-only cookies (production refuses `false`) |
| `TRUST_PROXY` | no | `0` | Reverse proxies in front of the API, for correct client IPs |
| `RATE_LIMIT_ENABLED` | no | `true` | Disable only for local experiments |
| `CLIENT_DIST_DIR` | no | — | Serve the built frontend from the API (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) |
| `LOG_LEVEL`, `LOG_PRETTY` | no | `info`, `true` in development | Logging |

The frontend has one optional variable, `VITE_API_URL` ([`client/.env.example`](client/.env.example)); leave
it empty when the frontend and API share an origin. `VITE_*` values are bundled into public JavaScript,
so they must never contain secrets. `API_PROXY_TARGET` overrides the Vite dev-proxy target (default
`http://localhost:5000`).

## Testing and linting

```sh
cd server
npm test           # needs MongoDB running; uses MONGODB_URI_TEST
npm run lint

cd ../client
npm test           # npm run test:watch while developing
npm run lint
npm run build
```

The backend suite runs against a real test database. It covers the API, model and index constraints,
concurrency (for example 20 customers racing for one seat — exactly one succeeds), payment idempotency,
cancellation and refund rules, security probes and Socket.IO behaviour. Time-based rules use a
controllable clock instead of waiting. A guard refuses to run if the test database is the development
database or its name doesn't end in `_test`, because tests delete data.

The frontend suite renders the real routes with mocked API modules and a fake socket.

## How booking works

1. **Select.** The seat page loads the show's seat map and the taken seats, then applies live updates.
2. **Hold.** `POST /api/bookings` holds up to 10 seats for 10 minutes in one transaction: it locks the show
   (`lockVersion`), clears expired holds on those seats, and inserts a `HELD` booking plus one reservation
   per seat. A unique `(showtime, seatId)` index makes double booking impossible; if any seat is taken the
   whole hold is rolled back and the API returns `409` with the taken seats. Prices and totals come from the
   server's copy of the show.
3. **Pay.** Each payment attempt carries an `Idempotency-Key`. A declined payment keeps the hold, so the
   customer can retry until it expires. An approved payment confirms the booking, books the seats and
   records the payment in one transaction — only if the hold is still valid and the show still open;
   otherwise the authorisation is voided.
4. **Expire or release.** An expired hold stops blocking its seats immediately, even before the background
   sweeper (every 15 s) marks it expired. A customer can also release a hold explicitly.
5. **Cancel.** A confirmed booking can be cancelled at least 120 minutes before the show. The seats are
   released and one full simulated refund is recorded per payment.

Booking states: `HELD → CONFIRMED | EXPIRED | RELEASED | CANCELLED`, and `CONFIRMED → CANCELLED`.

## Authentication and authorization

- Passwords are hashed with bcrypt (cost 12). Wrong password and unknown email produce the same error.
- Sessions use two httpOnly, `SameSite=Strict` cookies (`Secure` in production): a 15-minute JWT access
  token (HS256, issuer and audience checked) and a 7-day refresh token stored server-side only as a
  SHA-256 hash. Every refresh rotates the token; replaying a rotated token revokes the whole token family.
- The user record is reloaded on every request, so role changes, password changes and "log out
  everywhere" apply immediately.
- State-changing requests must come from `CLIENT_ORIGIN` (Origin/Referer check); CORS and Socket.IO
  accept only that origin.
- Roles are `customer` and `admin`. Admin routes are guarded on the server, sign-up can't set a role, and
  customers get 404 for bookings that aren't theirs.
- Input is validated with zod: unknown fields are dropped and MongoDB operator objects are rejected.
  Login, registration, refresh, booking and payment are rate-limited.

## Payments and refunds

The provider is a local simulation (`server/src/services/payments/simulatedProvider.js`) behind an
`authorize` / `capture` / `void` / `refund` interface, so a real gateway could replace it. On the payment
page the customer chooses the simulated outcome (approve, card declined, insufficient funds); the server
decides the amount and records the result. Card details are never requested, and browser-sent amounts or
statuses are ignored.

- A repeated `Idempotency-Key` returns the original result; database constraints allow one pending attempt
  and one captured payment per booking.
- Refunds are unique per payment, so repeated or simultaneous cancellations refund once.
- Cancelling a show as an admin marks it cancelled first (no new holds or payments can commit), then
  cancels each booking in its own transaction and reports `COMPLETED` or `PARTIAL`; repeating the request,
  or the background job, finishes any remainder.

Endpoints are listed in [docs/API.md](docs/API.md).

## Project structure

```
client/                   React app (Vite)
  public/                 favicon and original SVG artwork for the demo movies
  src/
    api/                  axios client with session refresh; one module per resource; Socket.IO client
    components/           ui/, layout/, movies/, showtimes/ (seat map), bookings/, routing/ guards
    context/, hooks/      auth state, data loading, real-time hooks
    pages/                customer pages; pages/admin/ is a lazy-loaded admin area
    styles/, utils/       design tokens and styles; IST/₹ formatting, validation, seat-layout helpers
    test/                 test setup, render helpers, fake socket
server/                   Express API
  scripts/                seed.js, create-admin.js
  src/
    config/               environment validation, business rules, logger, database
    domain/               seat-layout rules, status state machines
    routes/, controllers/, services/, validators/, models/
    middleware/           auth, origin check, rate limits, validation, errors, static site
    events/, sockets/     post-commit domain events and the Socket.IO server
    jobs/                 hold expiry and recovery sweeper
    seed/, utils/         demo data; clock, time (IST), money, transactions
  tests/                  node:test suites
docs/                     ARCHITECTURE.md, API.md, DEPLOYMENT.md
docker-compose.yml        local MongoDB replica set
```

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| `Invalid environment configuration: … JWT_ACCESS_SECRET` | The placeholder is still in `server/.env` — generate a secret (step 2) |
| API can't connect to MongoDB, or `/api/health` returns 503 | Docker isn't running or the container isn't healthy — `docker compose up -d`, then `docker compose ps` |
| Errors mentioning transactions or replica sets | `MONGODB_URI` lacks `?replicaSet=rs0` or points at a standalone server |
| Every action fails with `403 ORIGIN_NOT_ALLOWED` | The app was opened at an address other than `CLIENT_ORIGIN` (e.g. `127.0.0.1`) — use `http://localhost:5173` |
| `npm test` refuses to run | `MONGODB_URI_TEST` must end in `_test` and differ from `MONGODB_URI` |
| No showtimes are listed | Seeded showtimes cover 14 days from the seed run — run `npm run seed` again |
| `429 RATE_LIMITED` while testing logins | Wait 15 minutes or restart the API (limits are kept in memory) |
| PowerShell blocks `npm` scripts | Run `npm.cmd …`, or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |

## Known limitations

- Payments are simulated: no gateway, webhooks or reconciliation.
- No email features: no verification, password reset or emailed tickets. Registration reveals whether an
  email is already registered.
- Tickets are a booking reference, not a scannable code.
- Movie artwork is referenced by URL (bundled SVGs or https links); there are no uploads.
- One business time zone (IST) and currency (INR); no taxes or fees.
- Rate limits and Socket.IO broadcasting are per process, so the API is designed for a single instance
  (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for what scaling out would need).
- A rotated refresh token reused within 10 seconds is treated as a concurrent refresh (`409`), not theft.
- There is no automated browser end-to-end test suite. The application has not been deployed.

## Possible future work

These are not implemented:

- A real payment provider with signed webhooks and reconciliation.
- Email verification, password reset and emailed tickets.
- Redis-backed rate limiting and the Socket.IO Redis adapter for multiple API instances.
- Browser end-to-end tests (for example Playwright) and a CI workflow.
