# IMovies

IMovies is a full-stack cinema ticket booking and management system built with the MERN stack
(MongoDB, Express, React, Node.js). Customers browse movies, pick a showtime, choose exact seats
on a live seat map, hold them for 10 minutes, pay with a **simulated** (demo) payment and manage
their bookings. Administrators manage the catalogue, cinemas, seat layouts and showtimes, cancel
shows (with automatic refunds) and follow bookings and revenue.

> Payments are a **demo**: no real gateway, no card details, no money moves.
> Project progress, decisions and verification results: [docs/STATUS.md](docs/STATUS.md).

## Contents

[Features](#features) · [Tech stack](#tech-stack) · [Architecture](#architecture) ·
[Setup](#first-time-setup-windows-powershell) · [Running](#running-the-app) ·
[Demo walkthrough](#demo-walkthrough) · [Tests](#checks-and-tests) · [API](#api-reference) ·
[Security](#security-summary) · [Deployment](#deployment) · [Troubleshooting](#troubleshooting) ·
[Limitations](#known-limitations)

## Features

**Customers**
- Register, log in, log out (also "log out everywhere"), change name and password.
- Browse, search and filter movies (genre, language, now showing / coming soon), movie details.
- Theatres by city; showtimes by date, theatre and city, with seats-left hints (all times IST).
- Interactive seat map (categories, aisles, wheelchair and out-of-service seats, keyboard
  navigation) that updates **live** while others book.
- 10-minute seat hold with a countdown, demo payment (approve or decline), retry after a failed
  payment, confirmation and ticket page with booking reference.
- My bookings (upcoming / past & cancelled), cancellation with a full simulated refund up to
  2 hours before the show.

**Administrators**
- Dashboard: revenue, refunds, tickets sold, occupancy, top movies, recent bookings.
- Movies: create (as draft), edit, publish, archive, delete drafts.
- Theatres and screens with a **seat-layout editor** and live preview.
- Showtimes: schedule (overlaps refused), edit prices, cancel a show (all bookings cancelled and
  refunded automatically).
- Booking lookup by reference, customer or status, with payment and refund history.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, React Router 7, axios, Socket.IO client, react-toastify, custom CSS design system |
| Backend | Node.js 24, Express 5, Mongoose 9, Socket.IO 4, zod (validation), pino (logging), helmet, express-rate-limit, bcryptjs, jsonwebtoken |
| Database | MongoDB 8 as a single-node **replica set** in Docker (needed for transactions) |
| Tests | Backend: Node's built-in test runner + Supertest against a real test database; frontend: Vitest + React Testing Library + jsdom |
| Tooling | oxlint, Git, Docker Compose |

## Architecture

```
Browser (React)  ──HTTP /api──►  Express API  ──Mongoose──►  MongoDB replica set
       ▲                              │
       └────── Socket.IO /socket.io ◄─┘  (seat updates, published only after a commit)
```

- **One origin.** In development Vite serves the app on `localhost:5173` and proxies `/api` and
  `/socket.io` to the API on port 5000. In production the API can serve the built app itself
  (`CLIENT_DIST_DIR`). Same origin means simple, strict cookies (`SameSite=Strict`).
- **Layers in the API**: `routes/` (URLs, validation) → `controllers/` (HTTP in/out) →
  `services/` (all business rules) → `models/` (Mongoose schemas and indexes). Business
  constants approved by the project owner live in `server/src/config/business.js`.
- **The server is the authority** for seat availability, prices, booking and payment status,
  cancellation eligibility and permissions. The browser only displays.
- **Correctness under concurrency** comes from MongoDB transactions, unique and partial-unique
  indexes, and conditional status updates (details in [Booking engine](#booking-engine-seat-holds)).

```
IMovies/
├── client/                    React app
│   ├── public/posters, backdrops   original demo artwork (SVG)
│   └── src/
│       ├── api/               axios client (+ auto session refresh), one module per resource, socket
│       ├── components/        ui/ (buttons, forms, dialogs…), layout/, movies/, showtimes/, bookings/, routing/
│       ├── context/, hooks/   auth state, data loading, real-time hooks
│       ├── pages/             customer pages; pages/admin/ (lazy-loaded admin area)
│       ├── styles/            design tokens and component styles
│       ├── utils/             formatting (IST, ₹), validation, seat-layout helpers
│       └── test/              test setup and helpers
├── server/                    Express API
│   ├── scripts/               seed.js, create-admin.js
│   ├── src/
│   │   ├── config/            env validation, business rules, logger, database
│   │   ├── domain/            seat-layout rules, status state machines
│   │   ├── events/            post-commit domain events
│   │   ├── jobs/              background clean-up/recovery
│   │   ├── middleware/        auth, origin check, rate limits, validation, errors, static site
│   │   ├── models/            Mongoose models
│   │   ├── routes/, controllers/, services/, validators/
│   │   ├── seed/              demo data
│   │   ├── sockets/           Socket.IO server
│   │   └── utils/             clock, time (IST), money, transactions, …
│   └── tests/                 API, model, concurrency, security and socket tests
├── docs/STATUS.md             project status / hand-over document
└── docker-compose.yml         local MongoDB 8 (single-node replica set)
```

## Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Node.js | 22.12+ or 24.15+ (developed on 24.18) | `node -v` |
| npm | 10 or newer | `npm -v` |
| Docker Desktop | any recent version, **running** | `docker info` |
| Git | any recent version | `git --version` |

## First-time setup (Windows PowerShell)

Run these from the project folder, e.g. `C:\Users\Lenovo\Desktop\IMovies`.

```powershell
# 1. Docker Desktop must be running (this should print a version, not an error)
docker info --format '{{.ServerVersion}}'

# 2. Start MongoDB in the background (the first run downloads the image)
docker compose up -d

# 3. Wait until STATUS says "(healthy)" — usually 10-20 seconds
docker compose ps

# 4. Backend: install dependencies and create your local settings file
cd server
npm install
Copy-Item .env.example .env

# 5. Generate your own secret for signing logins and put it into .env
#    (the placeholder in .env.example is deliberately rejected)
$secret = node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
(Get-Content .env) -replace '^JWT_ACCESS_SECRET=.*', "JWT_ACCESS_SECRET=$secret" | Set-Content .env
Remove-Variable secret

# 6. Add demo movies, theatres and the next 7 days of showtimes (fictional data)
npm run seed
cd ..

# 7. Frontend: install dependencies
cd client
npm install
cd ..
```

- `.env` holds your local settings and is ignored by Git; never commit it. All other defaults
  in `.env.example` work as-is for local development.
- The seed only **adds** missing demo records and never overwrites anything, so it is safe to run
  again (for example every few days, to add new upcoming showtimes). It refuses to run when
  `NODE_ENV=production` and never runs automatically.

### Environment variables (server)

| Variable | Required | Example / default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `PORT` | no | `5000` | A whole number from 1 to 65535 |
| `MONGODB_URI` | **yes** | `mongodb://127.0.0.1:27017/imovies?replicaSet=rs0` | Application database (must be a replica set) |
| `MONGODB_URI_TEST` | for tests | `mongodb://127.0.0.1:27017/imovies_test?replicaSet=rs0` | Must end in `_test` and differ from `MONGODB_URI` |
| `CLIENT_ORIGIN` | **yes** | `http://localhost:5173` | The website's origin (no trailing slash): allowed by CORS, the Origin check and Socket.IO |
| `JWT_ACCESS_SECRET` | **yes** | 48 random bytes, base64url | Signs login tokens; generate it (step 5); never commit or reuse it |
| `BCRYPT_COST` | no | `12` | Password hashing work factor (production requires ≥ 12) |
| `COOKIE_SECURE` | no | `false` (dev), `true` (production) | HTTPS-only cookies (production refuses `false`) |
| `TRUST_PROXY` | no | `0` | Number of reverse proxies in front of the API (for real client IPs) |
| `RATE_LIMIT_ENABLED` | no | `true` | Turn off only for local experiments |
| `CLIENT_DIST_DIR` | no | `../client/dist` | Serve the built website from the API (production, see Deployment) |
| `LOG_LEVEL` · `LOG_PRETTY` | no | `info` · `true` in development | Log verbosity / human-readable logs |
| `ADMIN_EMAIL` · `ADMIN_PASSWORD` · `ADMIN_NAME` | script only | — | Used only by `npm run create-admin` |

If a value is missing or invalid the server refuses to start and names the variable (never its
value), for example `PORT Invalid input: expected number, received NaN`.

The client has one optional variable, `VITE_API_URL` (`client/.env.example`); leave it empty
when the website and API share an origin. Anything starting with `VITE_` is visible to every
browser, so never put secrets there.

### Creating an administrator

Public sign-up always creates **customer** accounts. Create (or promote) an administrator with
a script; set the values only in the current PowerShell window so the password is never
written to a file:

```powershell
cd C:\Users\Lenovo\Desktop\IMovies\server
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "choose-a-strong-password-1"   # 8+ characters, a letter and a number
$env:ADMIN_NAME = "Site Admin"
npm run create-admin
Remove-Item Env:ADMIN_PASSWORD, Env:ADMIN_EMAIL, Env:ADMIN_NAME
```

If the email already belongs to a customer, that account is promoted, its password is left
unchanged and its sessions are ended (log in again). Admin accounts manage the site; they
can't book tickets (booking is for customer accounts).

## Running the app

You need **two** PowerShell windows, and Docker Desktop running (MongoDB lives in it).

```powershell
# Window 1 — API on http://localhost:5000 (restarts automatically when server files change)
cd C:\Users\Lenovo\Desktop\IMovies\server
npm run dev
```

```powershell
# Window 2 — website on http://localhost:5173
cd C:\Users\Lenovo\Desktop\IMovies\client
npm run dev
```

Open **http://localhost:5173** (use `localhost`, not `127.0.0.1`: the address must match
`CLIENT_ORIGIN`). The footer's **System status** link should say "API and database are healthy".
Press `Ctrl+C` in each window to stop.

## Demo walkthrough

1. **Sign up** as a customer (any made-up email like `you@example.test`).
2. **Movies →** pick a "Now showing" film → choose a date and a showtime.
3. **Select seats** (up to 10) → **Continue**. The seats are held for 10 minutes; open the same
   show in a second browser window to watch them turn "held" live.
4. On **Review and pay**, choose "Decline: card declined" → **Pay** to see a failed payment, then
   "Approve the payment" → **Pay** again. You land on the ticket with your booking reference.
5. **My bookings** → open the booking → **Cancel booking** (allowed until 2 hours before the
   show) → the refund appears and the seats become free again.
6. Create an administrator (above), log in as them and open **Admin**: dashboard, schedule a
   show, edit a screen's seat layout, cancel a show, look up bookings.

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

- `npm test` in `server/` always uses `NODE_ENV=test` and `MONGODB_URI_TEST`. A guard refuses to
  run if that is your development database or its name doesn't end in `_test`, because tests
  delete data. Tests move a simulated clock instead of waiting, so they are fast.
- The backend tests include concurrency tests (e.g. 20 customers racing for one seat → exactly
  one succeeds), payment idempotency, cancellation and refund rules, security probes and real
  Socket.IO connections.
- `npm run test:watch` in `client/` re-runs frontend tests as you edit.

## Booking engine (seat holds)

How a hold is made safely, in one MongoDB transaction:

1. The show document is "locked" by incrementing its `lockVersion`. That serialises all holds for
   the show and makes a hold fail if the show was cancelled or has started meanwhile.
2. Any **expired** holds on the requested seats are expired and freed right there, so an expired
   hold never blocks anyone, even before the background clean-up runs.
3. The `HELD` booking and one reservation per seat are inserted. The unique index on
   `(showtime, seatId)` makes a second reservation of the same seat impossible; if any seat is
   taken, the whole transaction is rolled back (no partial holds) and the API answers
   `409 SEATS_UNAVAILABLE` with the list of seats.

Prices and the total come from the show's own prices on the server; anything the browser sends
besides the seat ids is ignored. A customer can have only one active hold per show (a partial
unique index, so a double-click can't create two). Seat availability is stored only for taken
seats (`seatreservations`), and each show keeps a copy of its screen's seat map, so editing a
screen never changes seats customers already booked.

## Payments (demo), cancellations and refunds

The provider sits behind a small interface (`authorize`, `capture`, `void`, `refund` in
`server/src/services/payments/simulatedProvider.js`), so a real gateway can replace it. A real
integration would also confirm results through signature-verified webhooks, never through
the browser.

- **Amount and result come from the server**: the amount is the booking's total; success is the
  provider's answer. Browser-sent amounts, statuses or card numbers are ignored and never stored.
- **A failed payment can be retried** while the 10-minute hold lasts. After it expires, payment
  is refused (`409 HOLD_EXPIRED`) and the seats are free for others.
- **No double charge**: a repeated `Idempotency-Key` returns the first result; the database
  allows only one in-progress attempt and only one captured payment per booking.
- **Confirmation is all-or-nothing**: booking `CONFIRMED`, seats `BOOKED` and payment
  `SUCCEEDED` commit together, and only if the hold is still valid and the show still open.
  Otherwise the authorisation is voided ("Not charged") and nothing is announced as booked.
- **Customer cancellation**: until 2 hours before the show (server time), full refund; only that
  booking's seats are released. A refund is recorded once per payment (unique index), so
  repeated or simultaneous cancellations never refund twice.
- **Admin show cancellation** first marks the show cancelled (no new holds or payments can
  commit), then cancels each booking in its own transaction. The outcome (`COMPLETED`/`PARTIAL`
  with counts) is stored on the show and in the audit log; repeating it finishes any remaining
  bookings, and a background job resumes interrupted runs.
- **Recovery jobs** (every 15 s, safe with several servers): expire holds, mark interrupted
  payments as failed, retry refunds the provider failed, resume interrupted show cancellations.

## Real-time seat updates (Socket.IO)

| Direction | Event | Meaning |
|---|---|---|
| client → server | `showtime:join` (showtimeId, ack) · `showtime:leave` | Start/stop watching one show (max 3 at a time) |
| server → client | `seats:changed` `{ showtimeId, changes: [{ seatId, state }] }` | Seats became `held`, `booked` or `available` |
| server → client | `showtime:cancelled` `{ showtimeId }` | The cinema cancelled the show |
| server → client | `booking:updated` `{ bookingId, status }` | One of **your** bookings changed (sent only to you) |

- Events are sent **only after the database transaction committed**; clients can only listen.
- Connections are accepted only from `CLIENT_ORIGIN`; the login cookie identifies the user, and the
  socket reconnects when you log in or out so personal events reach the right person.
- Events are hints, not the source of truth: the page applies them instantly, then refetches the
  seat list, and refetches again after every (re)connection, so missed or duplicated events
  can't leave a stale seat map.

## API reference

All endpoints are under `/api`. Errors always look like
`{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": […], "requestId": "…" } }`.
State-changing requests must come from `CLIENT_ORIGIN` (Origin check). Money is in **paise**
(₹1 = 100 paise); times are ISO-8601 UTC in responses, IST dates/times in admin inputs.

**Auth** (`/api/auth`) — 15-min access cookie + rotating 7-day refresh cookie, both httpOnly.

| Endpoint | Access | Purpose |
|---|---|---|
| `POST /register` · `POST /login` | public (rate-limited) | Create a customer / log in; wrong password and unknown email give the same message |
| `POST /refresh` | refresh cookie | Rotate tokens (reuse of an old token ends the session family) |
| `POST /logout` · `POST /logout-all` | anyone · logged in | End this session · every session |
| `GET /me` · `PATCH /me` · `POST /change-password` | logged in | Profile; a password change ends other sessions |

**Catalogue, theatres, showtimes** (public)

| Endpoint | Purpose |
|---|---|
| `GET /movies?q=&genre=&language=&release=all\|now-showing\|coming-soon&sort=release-desc\|release-asc\|title&page=&pageSize=` | Published movies, paginated `{ items, page, pageSize, total, totalPages }` |
| `GET /movies/filters` · `GET /movies/:idOrSlug` | Filter options · one published movie (drafts/archived → 404) |
| `GET /cities` · `GET /theatres?city=` · `GET /theatres/:idOrSlug` | Active theatres and their screens |
| `GET /showtimes?movie=&theatre=&city=&date=YYYY-MM-DD` | Upcoming shows (default next 7 days) with `priceFrom`, `capacity`, `seatsLeft` |
| `GET /showtimes/dates?movie=&theatre=&city=` | IST dates with shows (next 14 days) |
| `GET /showtimes/:id` · `GET /showtimes/:id/seats` | Show with seat map and prices · taken seats (`booked`/`held`/`mine`), your hold, `serverTime` |

**Bookings** (customers; other customers' bookings return 404)

| Endpoint | Purpose |
|---|---|
| `POST /bookings` `{ showtimeId, seatIds }` | Hold up to 10 seats for 10 minutes → `HELD` booking |
| `GET /bookings?scope=upcoming\|past\|all` · `GET /bookings/:id` | Your bookings · one booking with payments, refunds, `cancellation` eligibility, `serverTime` |
| `POST /bookings/:id/payments` `{ outcome: SUCCESS\|DECLINED\|INSUFFICIENT_FUNDS }` + header `Idempotency-Key` | Demo payment attempt |
| `POST /bookings/:id/release` · `POST /bookings/:id/cancel` | Give up a hold · cancel a paid booking (≥ 120 min before) |

**Administration** (`/api/admin`, admins only)

| Endpoint | Purpose |
|---|---|
| `GET /stats` | Dashboard figures |
| `GET/POST /movies` · `GET/PATCH/DELETE /movies/:id` · `POST /movies/:id/publish\|archive` | Movie management |
| `GET/POST /theatres` · `GET/PATCH /theatres/:id` · `POST /theatres/:id/screens` · `GET/PATCH/DELETE /screens/:id` | Theatres, screens, seat layouts |
| `GET/POST /showtimes` · `PATCH /showtimes/:id` · `POST /showtimes/:id/cancel` `{ reason }` | Scheduling, prices, show cancellation |
| `GET /bookings?q=&status=&showtime=` · `GET /bookings/:id` | Booking lookup |

`GET /api/health` → 200 when the database is connected and writable, otherwise 503.

## Security summary

Implemented (with automated tests in `server/tests/`, notably `security.test.js`,
`auth.test.js`, `bookings.test.js`, `payments.test.js`, `realtime.test.js`):

| Area | Control |
|---|---|
| Passwords | bcrypt (cost 12; 72-byte limit enforced), never returned or logged |
| Sessions | httpOnly + `SameSite=Strict` cookies, `Secure` in production; 15-min access JWT (HS256 pinned, issuer/audience checked); rotating refresh tokens stored hashed, replay revokes the family; `tokenVersion` for log-out-everywhere |
| CSRF / CORS | Origin check on every state-changing request; CORS allows only `CLIENT_ORIGIN`; Socket.IO accepts only that origin |
| Authorization | Roles re-read from the database on every request; admin routers guarded server-side; other customers' bookings return 404; registration can't set a role |
| Input | zod validation of params/query/body; unknown fields dropped (mass assignment); operator objects rejected (NoSQL injection); 100 KB body limit; malformed URLs → 400 |
| XSS | React escapes output; no `dangerouslySetInnerHTML`; image URLs limited to https/site paths without quote/bracket/space characters; strict CSP when the API serves the website |
| Abuse | Rate limits on login, registration, refresh, booking and payment |
| Money & seats | Prices, totals and outcomes decided by the server; unique indexes + transactions prevent double booking, double charge and double refund |
| Errors & logs | Uniform error bodies without stack traces; structured logs with request ids; passwords, tokens and cookies redacted |
| Dependencies | `npm audit` → 0 known vulnerabilities in both apps (checked 2026-10-21) |

These measures reduce risk; they don't make the application certifiably secure. See
[Known limitations](#known-limitations) for what remains.

## Deployment

Nothing is deployed by this project. This section explains how to do it yourself.

**Recommended shape: one Node service + MongoDB Atlas.** The website, API and WebSockets
share one origin, so the strict cookies, the Origin check and Socket.IO work unchanged.

1. **Database:** create a MongoDB **Atlas** cluster (Atlas clusters are replica sets, so
   transactions work; the free tier is enough for a demo). Create a database user, restrict
   network access, and use its `mongodb+srv://…/imovies?retryWrites=true` URI.
2. **Build the website:** `cd client; npm ci; npm run build` (creates `client/dist`).
3. **Run the API** on a host that supports long-running Node processes **and WebSockets**
   (for example Render, Railway, Fly.io or a VPS): `cd server; npm ci --omit=dev; npm start`,
   with these environment variables set in the host's dashboard (not in a committed file):

   | Variable | Production value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | the Atlas URI (with credentials — keep it secret) |
   | `CLIENT_ORIGIN` | your public URL, e.g. `https://imovies.example.com` |
   | `JWT_ACCESS_SECRET` | a new random value (never the development one) |
   | `CLIENT_DIST_DIR` | path to the built `client/dist` |
   | `TRUST_PROXY` | `1` (hosting platforms put a proxy in front of your app) |
   | `PORT` | usually provided by the host |

   With `NODE_ENV=production` the server requires HTTPS cookies and bcrypt cost ≥ 12, and refuses
   to run the demo seed. When `CLIENT_DIST_DIR` is set it serves the site with a strict Content
   Security Policy and an SPA fallback.
4. **HTTPS** is required (cookies are `Secure`). Hosting platforms provide it; on a VPS put a
   reverse proxy such as Caddy or Nginx in front, forwarding WebSocket upgrades for `/socket.io`.
5. **First administrator:** run `npm run create-admin` once with the production environment.

**Separate hosting** (website on a static host, API elsewhere) needs both on the same *site*
(e.g. `www.example.com` and `api.example.com` with a reverse-proxy rewrite) or changes to the
cookie and Origin settings. Many static-host rewrites don't proxy WebSockets; Socket.IO then falls
back to long-polling. Prefer the single-service shape.

**Limits of the current design for scaling out:** rate limits are in memory per process, and
real-time events are broadcast within one process. Running several API instances needs a
shared rate-limit store and a Socket.IO adapter (for example Redis). Background jobs are already
safe on several instances.

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| `Invalid environment configuration: … JWT_ACCESS_SECRET` | `.env` still has the placeholder or is missing the variable → setup step 5 |
| `Could not connect to MongoDB` / health shows 503 | Docker Desktop isn't running or the container is down → start Docker Desktop, `docker compose up -d`, wait for "(healthy)" |
| API logs "transactions … replica set" errors | `MONGODB_URI` is missing `?replicaSet=rs0` or points at a standalone MongoDB |
| Every action fails with `403 ORIGIN_NOT_ALLOWED` | You opened `127.0.0.1:5173` (or another address) instead of `CLIENT_ORIGIN` → use `http://localhost:5173` |
| "API unreachable" on the status page | The API isn't running (window 1), or it crashed — check its window |
| Port already in use | Another process uses 5000/5173 → stop it or change `PORT` (and Vite's proxy target via `API_PROXY_TARGET`) |
| `npm test` says the test database is refused | `MONGODB_URI_TEST` must end in `_test` and differ from `MONGODB_URI` — this protects your data |
| "Live updates paused" on the seat map | The socket can't connect (API restarting or proxy issue); seats still update after actions, and live updates resume automatically |
| No showtimes appear | The seed created shows for 7 days from when it ran → run `npm run seed` again |
| `429 RATE_LIMITED` while testing logins | Too many attempts; wait 15 minutes or restart the API (limits are in memory) |
| PowerShell blocks `npm` scripts | Use `npm.cmd …`, or allow scripts for your user: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |

## Known limitations

- **Payments are simulated** (no gateway, webhooks or reconciliation).
- **No email** features: no verification, password reset or e-mailed tickets; registration
  reveals whether an email is already registered.
- **Tickets are a reference code, not a scannable QR**; the cinema would verify the reference
  against IMovies' records (a reference on its own is not proof of entry).
- **Movie artwork is set by URL** (bundled SVGs or https links); there are no file uploads.
- **One business time zone** (IST) and one currency (INR); no taxes or fees.
- **Single-instance assumptions:** in-memory rate limits and in-process Socket.IO broadcasting
  (see Deployment).
- **Refresh-token race window:** a reused refresh token within 10 seconds of a legitimate refresh
  is treated as a harmless race rather than theft.
- **No automated end-to-end browser test suite** (e.g. Playwright); end-to-end flows were checked
  manually in Chrome (recorded in `docs/STATUS.md`).

## Key decisions

- **MongoDB as a single-node replica set** because multi-document transactions need a replica set.
- **MongoDB bound to `127.0.0.1`** locally, so no other device can reach it (and it needs no
  password in development). A hosted database must always use authentication.
- **No `dotenv`**: Node 22+ loads `.env` files itself (`process.loadEnvFile`).
- **Backend tests use Node's built-in runner** and **linting uses oxlint** (ESLint-compatible
  rules) — both were already in place and avoid extra dependencies.
- **Health means "can take bookings"**: 200 only when MongoDB is connected and writable.
- More decisions with reasons are recorded in [docs/STATUS.md](docs/STATUS.md).
