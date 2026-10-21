# IMovies

A cinema ticket booking and management system built with the MERN stack
(MongoDB, Express, React, Node.js).

> **Status:** Epic 1 — project foundation complete. The app currently shows a system
> status page that checks the API and database. Booking features come in later epics.
> See [docs/STATUS.md](docs/STATUS.md) for detailed progress, decisions and test results.

## Project layout

```
IMovies/
├── client/               React + Vite frontend (http://localhost:5173)
│   └── src/
│       ├── api/          axios instance + functions that call the backend
│       ├── components/   reusable UI pieces (with *.test.jsx next to them)
│       └── test/         Vitest setup
├── server/               Express API (http://localhost:5000)
│   ├── src/
│   │   ├── config/       env validation, logger, database connection
│   │   ├── routes/       URL → controller mapping
│   │   ├── controllers/  turn HTTP requests into responses
│   │   ├── middleware/   request validation, 404 + error handling
│   │   ├── utils/        AppError, shared validation schemas
│   │   ├── app.js        builds the Express app (used by tests too)
│   │   └── server.js     connects to MongoDB, then starts listening
│   └── tests/            automated tests (node:test + supertest)
├── docs/STATUS.md        project status / hand-over document
└── docker-compose.yml    local MongoDB 8 (single-node replica set)
```

## Prerequisites

| Tool | Version used | Check with |
|---|---|---|
| Node.js | 22.12 or newer, or 24.15+ (developed on 24.18) | `node -v` |
| npm | 10 or newer | `npm -v` |
| Docker Desktop | any recent version, **running** | `docker info` |
| Git | any recent version | `git --version` |

## First-time setup (Windows PowerShell)

Run these from the project folder, e.g. `C:\Users\Lenovo\Desktop\IMovies`.

```powershell
# 1. Make sure Docker Desktop is running (this should print a version, not an error)
docker info --format '{{.ServerVersion}}'

# 2. Start MongoDB in the background (first run downloads the image)
docker compose up -d

# 3. Wait until the STATUS column says "(healthy)" — usually 10-20 seconds
docker compose ps

# 4. Install backend dependencies and create your local env file
cd server
npm install
Copy-Item .env.example .env
cd ..

# 5. Install frontend dependencies
cd client
npm install
cd ..

# 6. (Optional, recommended) Add demo movies, theatres and the next 7 days of showtimes
cd server
npm run seed
cd ..
```

The seed only **adds** missing demo records (all fictional) and never overwrites anything,
so it is safe to run again — for example every few days to add new upcoming showtimes.
It refuses to run when `NODE_ENV=production` and never runs automatically.

`.env` holds your local settings and is ignored by Git. The defaults in
`.env.example` work as-is for local development.

### Environment variables (server)

| Variable | Required | Example / default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `PORT` | no | `5000` | Must be a whole number from 1 to 65535 |
| `MONGODB_URI` | **yes** | `mongodb://127.0.0.1:27017/imovies?replicaSet=rs0` | Development database |
| `MONGODB_URI_TEST` | for tests | `mongodb://127.0.0.1:27017/imovies_test?replicaSet=rs0` | Must end in `_test` and differ from `MONGODB_URI` |
| `CLIENT_ORIGIN` | **yes** | `http://localhost:5173` | The only browser origin allowed by CORS (no trailing slash) |
| `JWT_ACCESS_SECRET` | **yes** | 48 random bytes, base64url | Signs login tokens. Generate with the command in `.env.example`; never commit it |
| `BCRYPT_COST` | no | `12` | Password hashing work factor (production requires ≥ 12) |
| `COOKIE_SECURE` | no | `false` (dev), `true` (production) | HTTPS-only cookies |
| `TRUST_PROXY` | no | `0` | Number of reverse proxies in front of the API |
| `RATE_LIMIT_ENABLED` | no | `true` | Turn rate limiting off only for local experiments |
| `LOG_LEVEL` | no | `info` (`silent` in tests) | Log verbosity |
| `LOG_PRETTY` | no | `true` in development | `false` gives JSON log lines |

If a value is missing or invalid the server refuses to start and prints which variable is
wrong (never its value), for example:

```
Invalid environment configuration:
  - PORT Invalid input: expected number, received NaN
```

The client has one optional variable, `VITE_API_URL` (see `client/.env.example`).
Anything starting with `VITE_` is visible to every browser, so never put secrets there.

## Creating an administrator

Public sign-up always creates **customer** accounts. Administrators are created (or an
existing account promoted) with a script. Set the values only for the current PowerShell
session so the password is never written to a file:

```powershell
cd C:\Users\Lenovo\Desktop\IMovies\server
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "choose-a-strong-password-1"   # 8+ chars, a letter and a number
$env:ADMIN_NAME = "Site Admin"
npm run create-admin
Remove-Item Env:ADMIN_PASSWORD, Env:ADMIN_EMAIL, Env:ADMIN_NAME
```

If the email already belongs to a customer, that account is promoted to administrator, its
password is left unchanged and its sessions are ended (log in again to get admin access).

## Running the app

You need **two** PowerShell windows (one per server).

```powershell
# Window 1 — API (restarts automatically when you edit server files)
cd C:\Users\Lenovo\Desktop\IMovies\server
npm run dev
```

```powershell
# Window 2 — React app
cd C:\Users\Lenovo\Desktop\IMovies\client
npm run dev
```

Open **http://localhost:5173** (use `localhost`, not `127.0.0.1` — see "How login works").
The footer's **System status** link (`/status`) should say **"API and database are healthy"**.
Press `Ctrl+C` in each window to stop.

You can also call the health endpoint directly:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

## Checks and tests

```powershell
# Backend: tests (MongoDB must be running) and lint
cd C:\Users\Lenovo\Desktop\IMovies\server
npm test
npm run lint

# Frontend: tests, lint and production build
cd C:\Users\Lenovo\Desktop\IMovies\client
npm test
npm run lint
npm run build
```

`npm test` in `server/` always runs with `NODE_ENV=test` and therefore uses
`MONGODB_URI_TEST`. A built-in guard refuses to run if that database is your development
database or its name doesn't end in `_test`, because tests delete data.
`npm run test:watch` in `client/` re-runs frontend tests as you edit.

## Logs and errors

- In development the API prints one readable line per request. Each request gets an id,
  returned in the `X-Request-Id` response header.
- Every API error has the same shape, so the frontend can handle them in one place:

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [], "requestId": "…" } }
  ```

- For unexpected (500) errors the response says only `Internal server error`; the full
  details are in the server log, findable by `requestId`.
- Passwords, tokens and cookies are redacted from logs.

## Managing the database container

```powershell
docker compose ps        # status
docker compose stop      # stop MongoDB (data is kept)
docker compose start     # start it again
docker compose logs -f mongo   # follow logs (Ctrl+C to exit)
docker exec -it imovies-mongo mongosh imovies   # open a Mongo shell
```

Data lives in the Docker volume `imovies_imovies-mongo-data`, so it survives
restarts and even `docker compose down`.

> ⚠️ `docker compose down -v` **permanently deletes** all database data.

## Key decisions (why things are the way they are)

- **MongoDB runs as a single-node replica set.** MongoDB only allows
  multi-document transactions on a replica set. We need transactions later so
  that booking several seats is all-or-nothing.
- **MongoDB is bound to `127.0.0.1`.** Only programs on this computer can
  connect to it; other devices on your network cannot. Because of that, the
  local dev database has no username/password. A hosted production database
  must always use authentication.
- **The Vite dev server proxies `/api` to Express.** The browser only ever talks
  to `localhost:5173`, so frontend and API are the *same origin* in development.
  This makes cookie-based login (Epic 1) simple and avoids CORS problems.
- **CORS allowlist.** The API sends CORS headers only to `CLIENT_ORIGIN`. Other
  websites' JavaScript cannot read API responses.
- **No `dotenv` package.** Node 22+ can load `.env` files itself
  (`process.loadEnvFile`), so that is one less dependency.
- **Health means "can take bookings".** `/api/health` returns 200 only when MongoDB is
  connected *and* accepts writes (it is the replica-set primary); otherwise 503.

- **Requests are validated with zod.** Controllers only read validated data
  (`req.validated`), so unknown fields such as `role` are dropped and MongoDB operators
  like `{ "$gt": "" }` are rejected.

## How login works

- **Two httpOnly cookies** (JavaScript can't read them, so an XSS bug can't steal them):
  - `imovies_at` — a signed JWT access token valid for **15 minutes**, sent with every request.
  - `imovies_rt` — a random refresh token valid for **7 days**, sent only to `/api/auth/*`.
    The database stores only its SHA-256 hash.
- Both cookies are `SameSite=Strict`, and `Secure` (HTTPS-only) in production.
- When the access token expires, the React app calls `POST /api/auth/refresh` once and retries
  the original request. Every refresh **rotates** the refresh token; presenting an already-used
  refresh token (a sign it was copied) ends that whole login session family.
- The server reloads the user on every request, so "log out everywhere", a password change
  or a role change takes effect immediately.
- **CSRF protection:** every POST/PUT/PATCH/DELETE must carry an `Origin` (or `Referer`)
  matching `CLIENT_ORIGIN`, otherwise 403. Together with `SameSite=Strict` this replaces a
  separate CSRF token. (Open the app at `http://localhost:5173`, not `127.0.0.1:5173`, or the
  origin won't match.)
- Login and registration are **rate-limited** (10 logins per 15 min per IP + email,
  5 registrations per hour per IP). Wrong password and unknown email give the same message.

| Endpoint | Access | Purpose |
|---|---|---|
| `POST /api/auth/register` | public | Create a customer account and log in |
| `POST /api/auth/login` | public | Log in |
| `POST /api/auth/refresh` | refresh cookie | Rotate tokens |
| `POST /api/auth/logout` | anyone | End this device's session |
| `POST /api/auth/logout-all` | logged in | End every session |
| `GET /api/auth/me` · `PATCH /api/auth/me` | logged in | Read / rename the current user |
| `POST /api/auth/change-password` | logged in | Change password (ends other sessions) |

## Movie catalogue API

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /api/movies?q=&genre=&language=&release=all\|now-showing\|coming-soon&sort=release-desc\|release-asc\|title&page=&pageSize=` | public | Published movies, paginated (`{ items, page, pageSize, total, totalPages }`) |
| `GET /api/movies/filters` | public | Genres and languages present in the catalogue |
| `GET /api/movies/:idOrSlug` | public | One published movie (drafts/archived → 404) |
| `GET /api/admin/movies?q=&status=` · `GET /api/admin/movies/:id` | admin | All movies, any status |
| `POST /api/admin/movies` · `PATCH /api/admin/movies/:id` | admin | Create (always as `DRAFT`) / edit |
| `POST /api/admin/movies/:id/publish` · `.../archive` | admin | Status changes (archive refused while upcoming shows exist) |
| `DELETE /api/admin/movies/:id` | admin | Only never-scheduled drafts; otherwise archive |

Release dates are IST calendar dates (`"2026-12-25"`). Search is case-insensitive and treats
special characters literally.

## Booking engine (seat holds)

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /api/showtimes/:id/seats` | public (+ your own holds if logged in) | Taken seats: `{ A1: 'booked' \| 'held' \| 'mine' }`, your active hold, `serverTime` |
| `POST /api/bookings` `{ showtimeId, seatIds }` | customer | Hold up to 10 seats for **10 minutes** → `HELD` booking |
| `GET /api/bookings/:id` | owner | Booking with `serverTime` (other customers get 404) |
| `POST /api/bookings/:id/release` | owner | Give the seats back (idempotent) |

How a hold is made safely, in one MongoDB transaction:

1. The show document is "locked" by incrementing its `lockVersion`, which serialises all holds
   for that show and prevents committing against a show that was cancelled or has started.
2. Any **expired** holds on the requested seats are expired and freed right there, so an expired
   hold never blocks anyone, even if the background clean-up hasn't run yet.
3. The `HELD` booking and one reservation per seat are inserted. The unique index on
   `(showtime, seatId)` makes a second reservation of the same seat impossible; if any seat is
   taken, the whole transaction is rolled back (no partial holds) and the API answers
   `409 SEATS_UNAVAILABLE` with the list of seats.

Prices and the total come from the show's own prices on the server; anything the browser sends
besides the seat ids is ignored. A customer can have only one active hold per show (enforced by a
partial unique index, so a double-click can't create two). A background sweeper expires overdue
holds every 15 seconds for tidiness, but correctness never depends on it.

## Payments (demo), cancellations and refunds

**The payment provider is simulated.** No real gateway is contacted, no card details are
requested or stored, and no money moves. On the DEMO PAYMENT screen the customer chooses
what the simulated provider should do (approve, or decline with a reason). The provider sits
behind a small interface (`authorize`, `capture`, `void`, `refund` in
`server/src/services/payments/simulatedProvider.js`), so a real gateway can replace it. A real
integration would also confirm results through signature-verified webhooks, never through
the browser.

| Endpoint | Access | Purpose |
|---|---|---|
| `POST /api/bookings/:id/payments` `{ outcome }` + header `Idempotency-Key` | owner | One payment attempt. `201` with `payment.status` `SUCCEEDED` or `FAILED`; a repeated key returns the original result (`200`) |
| `POST /api/bookings/:id/cancel` | owner | Cancel a confirmed booking ≥ 120 min before the show → full simulated refund |
| `GET /api/bookings?scope=upcoming\|past\|all` | logged in | Your bookings (cancelled ones are never "upcoming") |
| `POST /api/admin/showtimes/:id/cancel` `{ reason }` | admin | Cancel a show: every affected booking is cancelled, paid ones refunded |

Rules (approved decisions 2, 4, 5) and safety guarantees:

- **Amount and result come from the server**: the amount is the booking's total; success is the
  provider's answer. Browser-sent amounts or statuses are ignored.
- **A failed payment can be retried** while the 10-minute hold lasts. After it expires, payment
  is refused (`409 HOLD_EXPIRED`) and the seats are free for others.
- **No double charge**: a repeated `Idempotency-Key` returns the first result; the database
  allows only one in-progress attempt and only one captured payment per booking.
- **Confirmation is all-or-nothing**: booking `CONFIRMED`, seats `BOOKED` and payment
  `SUCCEEDED` commit together, and only if the hold is still valid and the show still open.
  Otherwise the authorisation is voided ("Not charged") and nothing is announced as booked.
- **Cancellation**: allowed until 2 hours before the show (server time), full refund; seats of
  that booking only are released. A refund is recorded once per payment (unique index), so
  repeated or simultaneous cancellations never refund twice.
- **Admin show cancellation** first marks the show cancelled (no new holds or payments can
  commit), then cancels each booking in its own transaction. The result
  (`COMPLETED`/`PARTIAL` with counts) is stored on the show and in the audit log; calling it
  again finishes any remaining bookings, and a background job resumes interrupted runs.
- **Recovery jobs** (every 15 s): expire holds, mark interrupted payments as failed, retry
  refunds the provider failed, resume interrupted show cancellations.

## Real-time seat updates (Socket.IO)

The seat map updates live while you look at it. The server pushes notifications over Socket.IO
(path `/socket.io`; in development Vite proxies it to the API, including the WebSocket upgrade).

| Direction | Event | Meaning |
|---|---|---|
| client → server | `showtime:join` (showtimeId, ack) · `showtime:leave` | Start/stop watching one show (max 3 at a time) |
| server → client | `seats:changed` `{ showtimeId, changes: [{ seatId, state }] }` | Seats became `held`, `booked` or `available` |
| server → client | `showtime:cancelled` `{ showtimeId }` | The cinema cancelled the show |
| server → client | `booking:updated` `{ bookingId, status }` | One of **your** bookings changed (sent only to you) |

- Events are sent **only after the database transaction committed**, so a seat is never announced
  as booked when the booking failed.
- Clients can only listen: there is no event a browser can send to change seats.
- Connections are accepted only from `CLIENT_ORIGIN`; the login cookie identifies the user (anonymous
  visitors can watch seat maps but get no personal events). Joining requires a real, published show.
- Events are hints, not the source of truth: the page applies them instantly, then refetches
  `GET /api/showtimes/:id/seats`, and refetches again after every (re)connection, so missed,
  duplicated or out-of-order events can't leave a stale seat map.
- The small indicator under the prices shows "Live seat updates" or "Live updates paused — reconnecting".

## Theatres and showtimes API

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /api/cities` · `GET /api/theatres?city=` · `GET /api/theatres/:idOrSlug` | public | Active theatres (with screens) |
| `GET /api/showtimes?movie=&theatre=&city=&date=YYYY-MM-DD` | public | Upcoming bookable shows (default: next 7 days) with `priceFrom`, `capacity`, `seatsLeft` |
| `GET /api/showtimes/dates?movie=&theatre=&city=` | public | IST dates in the next 14 days that have shows |
| `GET /api/showtimes/:id` | public | One show with its seat map, named prices and `availability` (`OPEN`, `STARTED`, `COMPLETED`, `CANCELLED`) |
| `GET/POST /api/admin/theatres` · `GET/PATCH /api/admin/theatres/:id` | admin | Theatres (deactivation refused while upcoming shows exist) |
| `POST /api/admin/theatres/:id/screens` · `GET/PATCH/DELETE /api/admin/screens/:id` | admin | Screens and seat layouts |
| `GET/POST /api/admin/showtimes` · `PATCH /api/admin/showtimes/:id` | admin | Scheduling (IST `date` + `time`, prices in paise per seat category) |

Scheduling rules: the movie must be published and released by that date, the screen and
theatre active, the language one the movie offers, and every seat category priced. A show
occupies its screen until it ends **plus 15 minutes turnaround**; overlapping shows on the
same screen are rejected with `409 SHOWTIME_OVERLAP`, even when two admins submit at the
same moment. Once seats are held or booked, a show's time can no longer change (prices can;
existing bookings keep the price they paid). Editing a screen's layout only affects shows
scheduled afterwards, because every show keeps its own copy of the seat map.
