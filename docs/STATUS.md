# IMovies — Project Status

This file is the hand-over document: read it first after a break or context reset.
Only features whose acceptance criteria are verified are marked **Done**.

## Resume here

| Item | Value |
|---|---|
| Branch | `main` |
| Last completed epic | Epic 2 — database models and seed data |
| Current epic | Epic 3 — authentication and authorization |
| Next steps | Implement auth API (register/login/refresh/logout/me), middleware, Origin check, rate limits, admin bootstrap script; then frontend shell + auth pages |

To resume: `git status`, `git log --oneline -5`, read this file, run the checks in "Latest verified results", continue with the current epic.

## Commits

| Commit | Description |
|---|---|
| `c5b46e26b0e07760f9e1b983c41bcde506d99b63` | Epic 0 — project foundation (baseline) |
| `1c1b4c0467b4deac179e529579a7b83212e66291` | Epic 1 — hardened project foundation |
| _(see `git log`)_ | Epic 2 — database models and seed data |

## Epic overview

| # | Epic | Status |
|---|---|---|
| 1 | Repository assessment and project foundation | **Done** (`1c1b4c0`) |
| 2 | Database models and seed data | **Done** |
| 3 | Authentication and authorization | In progress |
| 4 | Movie catalog and search | Pending |
| 5 | Theatres, screens and show scheduling | Pending |
| 6 | Seat inventory and booking engine | Pending |
| 7 | Payment simulation and booking confirmation | Pending |
| 8 | Real-time seat availability (Socket.IO) | Pending |
| 9 | Customer dashboard and booking history | Pending |
| 10 | Admin dashboard | Pending |
| 11 | Security, testing and optimization | Pending |
| 12 | Deployment and documentation | Pending |

## Approved business decisions (confirmed by project owner, 2026-10-21)

| # | Decision | Affects |
|---|---|---|
| 1 | **Rotating refresh tokens, 7-day lifetime**, alongside 15-minute access tokens. Each refresh issues a new refresh token; reuse of an old one revokes the whole token family. | Epic 3 |
| 2 | **Full simulated refund** when a customer cancels **at least 120 minutes** before the show starts; no cancellation after that. | Epics 7, 9 |
| 3 | Currency **INR** (stored as integer paise), time zone **Asia/Kolkata**, **no taxes or fees** — the booking total is the sum of seat prices. | Epics 2, 5, 6 |
| 4 | A **failed simulated payment can be retried** until the **10-minute seat hold** expires; after expiry the seats are released. | Epics 6, 7 |
| 5 | When an **admin cancels a showtime**, all affected bookings are **automatically cancelled** and **simulated refunds are recorded**. | Epics 5, 10 |

These are code constants in `server/src/config/business.js` (not environment variables), so configuration can't silently change them.

## Epic 2 — database models and seed data (Done)

### Data model

| Collection | Purpose | Key constraints / indexes |
|---|---|---|
| `users` | Customers and admins | unique `email` (stored lower-case); `passwordHash` hidden by default; `tokenVersion` for revocation |
| `refreshsessions` | One per issued refresh token (hash only) | unique `tokenHash`; `familyId` for reuse revocation; TTL on `expiresAt` |
| `movies` | Catalogue; `DRAFT` → `PUBLISHED` ↔ `ARCHIVED` | unique `slug`; `(status, releaseDate)`, `(status, genres, releaseDate)` |
| `theatres` | Cinemas | unique `slug`; `(city, isActive)` |
| `screens` | Screens with their **seat layout** (rows on a grid, categories, accessible/disabled seats) | unique `(theatre, name)`; `scheduleVersion` serialises scheduling |
| `showtimes` | A movie on a screen at a time; **copy of the seat map**, prices per category (paise) | `(screen, startsAt)`, `(movie, status, startsAt)`, `(theatre, status, startsAt)`; `lockVersion` |
| `seatreservations` | One document per **taken** seat of a show (`HELD` with expiry, or `BOOKED`) | **unique `(showtime, seatId)` — the double-booking guarantee**; TTL backstop |
| `bookings` | Customer bookings with a snapshot of movie/theatre/show and seat prices | unique `reference`; **partial unique `(user, showtime)` where `HELD`** (one active hold) |
| `payments` | One per payment attempt (simulated; no card data) | unique `(user, idempotencyKey)`; partial unique `booking` where `PENDING`; partial unique `booking` where `captured` |
| `refunds` | Simulated refunds | unique `payment` (no double refund) |
| `auditlogs` | Admin actions | `(entityType, entityId, createdAt)` |

**Seat inventory decision.** Free seats have no document; only taken seats are stored in
`seatreservations`. Rejected alternatives: embedding all seat states in the showtime document (every
booking rewrites one hot document, so bookings of *different* seats conflict, and per-seat expiry inside
arrays is awkward), and pre-creating one document per seat per show (thousands of documents that never
change). The unique `(showtime, seatId)` index makes double-booking impossible at the database level.

**State machines** (`server/src/domain/statuses.js`): booking `HELD → CONFIRMED | EXPIRED | RELEASED | CANCELLED`,
`CONFIRMED → CANCELLED`; payment `PENDING → SUCCEEDED | FAILED | VOIDED`, `SUCCEEDED → REFUNDED`;
showtime `SCHEDULED → CANCELLED`; movie `DRAFT → PUBLISHED | ARCHIVED`, `PUBLISHED → ARCHIVED`, `ARCHIVED → PUBLISHED`.
"Completed"/"open for booking" for showtimes are derived from the clock, not stored.

**Time and money.** All instants are stored in UTC; `utils/time.js` converts IST wall-clock input and groups by IST
day. Money is integer paise (`utils/money.js`). Business rules read time from `utils/clock.js` so tests can move
the clock instead of sleeping.

**Indexes** are created explicitly by `ensureIndexes()` at server start-up and in tests, before any request is served
(Mongoose auto-indexing is off).

### Seed data

`cd server; npm run seed` adds 10 published fictional movies (2 "coming soon") + 1 draft, 4 theatres in Mumbai,
Bengaluru and Delhi, 6 screens (two layouts with Classic/Prime/Recliner seats, accessible and out-of-service seats),
and showtimes for the next 7 days (IST slots 10:00, 13:30, 17:15, 21:00). Posters/backdrops are original SVGs in
`client/public/posters` and `client/public/backdrops`. The seed is idempotent and never overwrites existing records.
It refuses to run when `NODE_ENV=production` and never runs on server start.

### Verified

| Check | Result |
|---|---|
| `server: npm test` | 67 passed, 0 failed (34 new: domain rules, model constraints, seed) |
| Concurrency | 10 concurrent transactions reserving one seat → exactly 1 succeeds (`models.test.js`) |
| `server: npm run lint` | 0 problems |
| `npm run seed` against the dev DB | 1st run: 11 movies, 4 theatres, 6 screens, 168 showtimes; 2nd run: 0 created |

## Epic 1 — foundation hardening (Done, `1c1b4c0`)

Env validation (zod; `PORT=abc` exits cleanly), test-database guard, structured logging with request ids and
redaction, consistent error format, central request validation (`req.validated`), health = connected **and**
writable, fail-fast DB, graceful shutdown, axios client wrapper with timeout, Vitest frontend tests, server lint,
`.editorconfig`, `.gitattributes`.

## Latest verified results

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd server; npm test` | **67 passed**, 0 failed, 0 skipped |
| Backend lint | `cd server; npm run lint` | 0 problems |
| Frontend tests | `cd client; npm test` | 13 passed (unchanged in Epic 2) |
| Frontend lint / build | `cd client; npm run lint; npm run build` | Passed (unchanged in Epic 2) |
| Browser (visual) check | — | Not yet performed (no customer pages yet) |

## Architectural decisions

| Decision | Choice | Reason |
|---|---|---|
| Env loading | Node's built-in `process.loadEnvFile` instead of `dotenv` | Same behaviour, one less dependency (Node ≥ 22). |
| Backend test runner | `node:test` + Supertest (not Jest/Vitest) | Already working, zero extra dependencies. |
| Linter | oxlint (ESLint-compatible rules) instead of ESLint | Scaffolded by Vite; much faster; same rule names. |
| Logging | pino + pino-http (pino-pretty in development) | Structured JSON, built-in redaction. |
| Validation | zod schemas; controllers read `req.validated` | Strips unknown fields (mass assignment) and rejects operator objects (NoSQL injection). |
| Frontend HTTP | axios instance + `apiRequest()` returning `{ ok, status, data, kind }` | Interceptors for token refresh; one place for error handling. |
| Frontend tests | Vitest 5 + React Testing Library + jsdom | Spec requirement; shares Vite config. |
| Database | MongoDB 8 single-node replica set in Docker, bound to 127.0.0.1 | Transactions require a replica set. |
| Seat inventory | Sparse `seatreservations` collection with unique `(showtime, seatId)` | See Epic 2. |
| Concurrency | Transactions + unique/partial-unique indexes + conditional status updates; `Screen.scheduleVersion` and `Showtime.lockVersion` as write-conflict points | A transaction alone doesn't stop two "check then insert" flows; a shared written document or a unique index does. |
| Auth (Epic 3) | 15-min JWT access cookie + rotating 7-day refresh cookie, httpOnly, `SameSite=Strict`, Origin check on unsafe methods, `tokenVersion` revocation, bcryptjs cost 12 | Approved decision 1. |

## Operational defaults (not owner decisions)

Showtime turnaround 15 min; max 10 seats per booking (`server/src/config/business.js`).

## Known defects / limitations

- `client` uses oxlint 1.89.0 (from the Vite scaffold), `server` uses 1.87.0 — harmless.
- Frontend is still the Epic 0 status page; customer UI starts in Epic 3/4.

## Environment variables

Server (`server/.env`, template in `server/.env.example`): `NODE_ENV`, `PORT`, `MONGODB_URI`, `MONGODB_URI_TEST`,
`CLIENT_ORIGIN`, optional `LOG_LEVEL`, `LOG_PRETTY`. Client: optional `VITE_API_URL`.

## Setup

See [README.md](../README.md) for exact Windows PowerShell commands.
