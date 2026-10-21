# IMovies — Project Status

This file is the hand-over document: read it first after a break or context reset.
Only features whose acceptance criteria are verified are marked **Done**.

## Resume here

| Item | Value |
|---|---|
| Branch | `main` |
| Last completed epic | Epic 11 — security, testing and optimisation |
| Current epic | Epic 12 — deployment readiness and documentation |
| Next steps | README: full overview/features/architecture, deployment guide (hosting options, CSP for the static frontend, HTTPS/cookies, `TRUST_PROXY`, Socket.IO hosting caveats, MongoDB Atlas/replica set), troubleshooting, known limitations; verify setup instructions from a clean clone; final report. |
| Dev environment | Start Docker Desktop first (MongoDB runs in it). Dev servers: `cd server; npm run dev` and `cd client; npm run dev`. |

To resume: `git status`, `git log --oneline -5`, read this file, run the checks in "Latest verified results", continue with the current epic.

## Commits

| Commit | Description |
|---|---|
| `c5b46e26b0e07760f9e1b983c41bcde506d99b63` | Epic 0 — project foundation (baseline) |
| `1c1b4c0467b4deac179e529579a7b83212e66291` | Epic 1 — hardened project foundation |
| `6b870e54a719d1abc301711f999fb5f476366089` | Epic 2 — database models and seed data |
| `d5b27680625badaebd059b8822cce01cf8c07752` | Epic 3 — authentication and authorization |
| `0c561323caf6b7feb7ad826d278fd25ce1c029e6` | Epic 4 — movie catalogue and search |
| `a1dcfe25d2356f29270fefc946f315bab19acb8c` | Epic 5 — theatres, screens and show scheduling |
| `0005a059691b0a7b9d7c6cafc3bc07034ba0aa0b` | Epic 6 — seat inventory and booking engine |
| `42ba9316cd5525248a7d17d675432a9210ee5cd4` | Epics 7 & 9 — payments, cancellations, refunds, booking history |
| `40e0694674f5a9f8a0bcf81fe47c51f19604977e` | Epic 8 — real-time seat availability |
| `34470dfb0c0e19ebf3b0ad713959f4e7e495e099` | Epic 10 — admin dashboard and management |
| _(see `git log`)_ | Epic 11 — security, testing and optimisation |

## Epic overview

| # | Epic | Status |
|---|---|---|
| 1 | Repository assessment and project foundation | **Done** (`1c1b4c0`) |
| 2 | Database models and seed data | **Done** (`6b870e5`) |
| 3 | Authentication and authorization | **Done** (`d5b2768`) |
| 4 | Movie catalog and search | **Done** (`0c56132`) |
| 5 | Theatres, screens and show scheduling | **Done** (`a1dcfe2`; cancellation → Epic 7) |
| 6 | Seat inventory and booking engine | **Done** (`0005a05`) |
| 7 | Payment simulation and booking confirmation (+ cancellations, refunds, admin show cancellation API) | **Done** (`42ba931`) |
| 8 | Real-time seat availability (Socket.IO) | **Done** (`40e0694`) |
| 9 | Customer dashboard and booking history | **Done** (delivered with Epic 7; account page from Epic 3) |
| 10 | Admin dashboard | **Done** (`34470df`) |
| 11 | Security, testing and optimization | **Done** |
| 12 | Deployment and documentation | In progress |

## Approved business decisions (confirmed by project owner, 2026-10-21)

| # | Decision | Affects |
|---|---|---|
| 1 | **Rotating refresh tokens, 7-day lifetime**, alongside 15-minute access tokens. Each refresh issues a new refresh token; reuse of an old one revokes the whole token family. | Epic 3 |
| 2 | **Full simulated refund** when a customer cancels **at least 120 minutes** before the show starts; no cancellation after that. | Epics 7, 9 |
| 3 | Currency **INR** (stored as integer paise), time zone **Asia/Kolkata**, **no taxes or fees** — the booking total is the sum of seat prices. | Epics 2, 5, 6 |
| 4 | A **failed simulated payment can be retried** until the **10-minute seat hold** expires; after expiry the seats are released. | Epics 6, 7 |
| 5 | When an **admin cancels a showtime**, all affected bookings are **automatically cancelled** and **simulated refunds are recorded**. | Epics 5, 10 |

These are code constants in `server/src/config/business.js` (not environment variables), so configuration can't silently change them.

## Epic 11 — security, testing and optimisation (Done)

**Review.** Checked against the spec's list (secrets, cookies, authorization, IDOR, NoSQL injection, XSS, CSRF, CORS,
validation, logging, error messages, admin operations, races, payment/cancellation transitions, URL handling,
dependencies). Results: no secret patterns in any commit and no `.env` ever committed; no unsafe HTML rendering;
`npm audit` 0 vulnerabilities (server and client). Summary table and residual risks are in README "Security summary".

**Defects found and fixed.**
1. Socket identity went stale after login/logout (anonymous socket kept after logging in → missed personal events;
   previous user's room kept after logout) → `AuthProvider` reconnects the socket when the user changes.
2. Image URLs could contain quotes/brackets and break out of CSS `url("…")` → rejected server-side
   (`UNSAFE_URL_CHARS` in model + validator).
3. Malformed %-encoding in URL parameters returned 500 → library 4xx errors now map to `400 BAD_REQUEST`.
4. Movie grid was one column on phones (2 × 42vw + gap overflowed by ~1 px) → column size based on the container.

**Verified.** Server 185 tests (9 new security probes: query-string operator injection can't widen filters, JSON
operator objects rejected on login, CSS/HTML-breaking and javascript:/data: image URLs rejected, foreign-origin
preflight gets no CORS headers, forged cross-site logout-all refused while the session survives, helmet headers,
malformed URLs → 400 without internals, every admin endpoint 403 for customers, no self-promotion to admin). Client
88 tests (1 new: socket reconnects on login). **Mobile (390 px frames in Chrome):** home, movies, seat map and admin
showtimes have no horizontal overflow; the menu toggle opens the navigation; seat map and admin tables scroll inside
their own containers; movie grid shows 2 columns.

**Performance notes.** Indexes match the actual queries (Epic 2); list endpoints return trimmed fields and are
paginated; admin pages are separate lazy-loaded chunks; posters load lazily with fixed aspect ratios; Socket.IO rooms
are per show. Not done (not needed at this scale): caching, CDN, Redis.

## Epic 10 — admin dashboard and management (Done)

**Backend.** `services/adminService.js` + `routes/admin.routes.js` (`requireAdmin` on the router): dashboard stats
computed from the database (captured payments and successful refunds in the last 30 days, tickets of still-confirmed
bookings, booked/bookable seats over the next 7 days, top movies, recent bookings) and booking lookup (reference,
customer email/name, status, show) with detail (payments, refunds, show status).

**Frontend.** Lazy-loaded admin area (`pages/admin/*`, `routes.jsx`; separate JS chunks, `Suspense` inside the admin
layout so the admin navigation stays visible): Dashboard (stat tiles, top movies, recent bookings), Movies (filter,
publish/archive/delete with confirmation, create/edit form with client + server field validation), Theatres & screens
(create/edit, activate/deactivate with confirmation, seat-layout editor with live `SeatMap` preview and server
validation messages; `utils/seatLayout.js` builds/describes layouts and converts rupees ↔ paise), Showtimes (filters,
schedule form pricing every category of the chosen screen, edit-prices dialog, cancel dialog with required reason and
outcome report, retry for incomplete cancellations), Bookings (search, detail).

**Verified.** Server 176 tests (3 new: admin-only, exact stats against crafted data, booking search/detail). Client
87 tests (9 new). **Browser (admin):** a test account promoted with `npm run create-admin`; dashboard showed real
figures (₹500 paid − ₹500 refunded from the earlier journey); scheduling an overlapping time was refused with the
overlap message; a free slot was scheduled (prices ₹150/₹220/₹399.50 stored as 15000/22000/39950 paise); that show was
cancelled through the dialog ("0 bookings cancelled, 0 refunds" — correct, it had none); the screen editor loaded an
existing layout (52 bookable seats). Fixed during the epic: lint "impure function during render" (date default),
search history spam, started shows shown with a success badge.

## Epic 8 — real-time seat availability (Done, `40e0694`)

**Backend.** `sockets/realtime.js` attached to the HTTP server in `server.js` (closed on shutdown): `allowRequest`
rejects any Origin other than `CLIENT_ORIGIN`; the access cookie identifies the user (invalid/expired → anonymous);
`showtime:join` validates the id, requires an existing published show, rate-limits joins (30/min) and keeps at most
3 show rooms per socket; personal `booking:updated` goes to a per-user room; only `events/bus.js` events (published
after commit) are forwarded; clients have no way to emit seat changes.

**Frontend.** `api/socket.js` (single shared connection), `hooks/useShowtimeLive.js` (join/leave, status, resync after
every join), `ShowtimePage` applies events instantly on top of the last fetch and refetches 400 ms later, removes
selected seats taken by others, reacts to show cancellation; checkout and ticket pages refresh on their own booking's
updates; Vite proxies `/socket.io` with `ws: true`; tests use a global fake socket (`test/fakeSocket.js`).

**Verified.** Server 173 tests (7 new, against a real Socket.IO server: foreign Origin rejected; held → booked →
released broadcast in order; failed hold and other shows announce nothing; invalid/unknown/draft shows can't be
joined; client-sent fake events ignored; personal events only to the owner; reconnect + refetch recovers missed
changes — required scenario 12). Client 78 tests (7 new). **Browser, two independent clients:** Chrome tab watching
a show while a separate test customer (Node script with its own cookies) held G5+G6 at 10:03:55.3 → tab showed
"held by another customer" by 10:03:55; release at 10:04:03.4 → "available" by 10:04:04; no page reload.

## Epics 7 & 9 — payments, cancellations, refunds, booking history (Done, `42ba931`)

**Backend.** `services/payments/simulatedProvider.js` (authorize/capture/void/refund interface, demo outcomes,
swappable for tests), `services/paymentService.js` (idempotent attempts, authorise → confirm transaction → capture;
void on any failure to confirm; stale PENDING recovery), `services/refundService.js` (refund recorded PENDING inside
the cancellation transaction, completed by the provider after commit, retried if it fails),
`services/cancellationService.js` (customer cancellation with the 120-min rule against the show's current start time;
admin showtime cancellation: step 1 mark CANCELLED, step 2 per-booking transactions, progress COMPLETED/PARTIAL with
DB-counted totals, safe to repeat, resumed by a background task), `services/bookingHistoryService.js` (upcoming vs
past/cancelled). Booking responses now include `payments`, `refunds` and server-computed `cancellation` eligibility.
Payment JSON hides `idempotencyKey`, `captured`, `user`. The sweeper runs four idempotent tasks.

Idempotency keys and constraints: `(user, idempotencyKey)` unique; one PENDING payment per booking; one captured
payment per booking; one refund per payment; booking status transitions are conditional updates.

**Frontend.** DEMO PAYMENT panel (explicit "no card details, no real money", outcome choice, new idempotency key per
attempt, same key kept after a network failure, attempt history), checkout redirects to the ticket on success,
Booking detail / ticket page (confirmation banner, dashed ticket with reference and authenticity note, payment and
refund status, cancellation with server cutoff and confirmation dialog), My bookings (Upcoming / Past & cancelled,
pagination), header link for customers.

**Verified.** Server 166 tests (22 new: success, decline+retry, refusal after expiry, approved-but-expired → VOIDED
with no "booked" event (required scenario 9), cancelled show during payment, same key repeated and concurrent,
6 racing attempts → exactly one capture, key reused for another booking → 422, browser-sent amount/card number
ignored and not stored, stale payment recovery, cancellation before/after cutoff, concurrent cancellations → one
refund, refund failure retried, admin show cancellation with paid+held bookings incl. retry, interrupted cancellation
resumed, customer and admin cancelling simultaneously → one refund, history scopes). Client 71 tests (8 new).
**Browser (full journey):** F7+F8 held, declined demo payment shown with retry, approved → confirmation page
(`IMV-RY7QU725`, ₹500 paid), cancelled via dialog → refund ₹500 recorded, payment REFUNDED, seats free again.

## Epic 6 — seat inventory and booking engine (Done, `0005a05`)

**Backend.** `services/holdService.js` (`createHold`, `releaseHold`, `getSeatAvailability`, `expireHolds`,
`sweepExpiredHolds`, `lockOpenShowtime`), `events/bus.js` (domain events published only after commit),
`jobs/holdSweeper.js` (every 15 s, non-overlapping, multi-instance safe), `utils/reference.js` (crypto-random
`IMV-XXXXXXXX`), `validators/bookings.js`, `routes/bookings.routes.js`. Booking responses include `serverTime`.

Concurrency design (see README "Booking engine"): showtime `lockVersion` write + lazy expiry + unique
`(showtime, seatId)` + partial unique one-HELD-per-user-per-show, all in one transaction; duplicate-key failures are
mapped to `409 SEATS_UNAVAILABLE` (with the taken seats) or `409 HOLD_EXISTS`. Seats are validated against the show's
own seat-map snapshot (unknown/out-of-service → 400). Admin accounts cannot book (customer-only route).

**Frontend.** Interactive seat selection on the showtime page (max 10, indicative total in a sticky bar, waits for
login status and availability before showing any seat as free, removes seats taken by others with an explanation,
keeps the selection across the login redirect via sessionStorage, existing-hold banner with continue/release),
checkout page (booking snapshot summary, server-clock countdown with polite screen-reader announcements, release with
confirmation, expired/released states). Payment panel is a clearly labelled "next step" notice until Epic 7.

**Verified.** Server 144 tests (15 new), including **20 customers racing for one seat → exactly 1 hold, 19 × 409, one
reservation, no orphan bookings**; overlapping multi-seat races → no seat reserved twice and no partial holds;
double-click → one hold; lazy expiry after 10 min; sweeper once and idempotent; release idempotent; 404 for other
customers; events only after commit. Client 63 tests (10 new). Browser: selected E7+E8 (₹500), held them, checkout
showed server summary and 9:58 countdown; a cookie-less second client saw E7/E8 as `held` without identity, the
owner saw `mine`. Bugs found and fixed: Mongoose subdocument spread lost seat fields (all prices undefined); a
transaction query ran without its session; seat map briefly showed every seat as free; availability was fetched
twice while login status loaded.

## Epic 5 — theatres, screens and show scheduling (Done, `a1dcfe2`)

**Backend.** `services/theatreService.js`, `services/showtimeService.js`, `validators/cinema.js` (seat layout schema
reuses `domain/seatLayout.js`), `routes/cinema.routes.js`. Public: cities, active theatres (+screen counts), theatre
detail, upcoming shows filtered by movie/theatre/city/IST date with `priceFrom`/`capacity`/`seatsLeft` (booked seats +
unexpired holds), IST dates with shows, single show with seat map and named prices, derived `availability`
(OPEN/STARTED/COMPLETED/CANCELLED). Admin: theatre CRUD (deactivate refused with upcoming shows), screen CRUD (layout
edits affect only future shows; delete only unused screens), scheduling in a transaction that first increments
`Screen.scheduleVersion` (serialises same-screen scheduling) then checks overlap including 15-min turnaround; edits:
prices/language anytime, time only without active bookings (checked inside the transaction, `lockVersion` bumped).

**Deferred by design:** admin showtime **cancellation** (approved decision 5) needs bookings, payments and refunds;
it is implemented in Epic 7 together with customer cancellation and refunds.

**Frontend.** `ShowtimePicker` (date tabs, city filter, groups by theatre or movie, sold-out/filling-fast hints, all
IST, state in URL), Theatres list (city filter) and Theatre detail (shows by movie), Showtime page (details, prices,
read-only `SeatMap`). `SeatMap`: grid columns create aisles; states by shape as well as colour (held = stripes,
booked = ×, out of service = dashed, accessible = blue dot); one tab stop with arrow-key navigation; read-only mode
renders labelled images, not dead buttons.

**Verified.** Server 129 tests (15 new: filters, IST dates, seats-left accounting incl. expired holds, availability
over time, overlap incl. turnaround and back-to-back, **5 simultaneous overlapping schedules → exactly 1 created**,
validation, edit rules, deactivation rules, layout snapshot). Client 53 tests (8 new). Browser: movie page showtime
picker with live data, showtime page seat map (aisles, recliner offset, out-of-service D7, accessible markers, 127
seats left). Fixed during the epic: Mongoose update validator ran without the document (price edits rejected);
read-only seats showed a hover affordance.

## Epic 4 — movie catalogue and search (Done, `0c56132`)

**Backend.** `services/movieService.js`, `validators/movies.js`, `routes/movies.routes.js`; `utils/query.js`
(escaped regex search, pagination), `services/auditService.js` (admin actions → `auditlogs` + log line).
Public: published movies only; release status computed from the server clock; drafts/archived → 404 like missing
movies. Admin (`/api/admin/movies`, `requireAdmin` on the whole router): create always as DRAFT (status in the body is
ignored), auto-unique slugs, PATCH whitelist, publish/archive via the state machine with conditional updates, archive
refused while upcoming SCHEDULED showtimes exist, delete only never-scheduled drafts. Editing duration affects only
future scheduling (existing showtimes keep their times; bookings keep their snapshot).

**Frontend.** Home (featured now-showing hero, Now showing / Coming soon rows), Movies (search debounced 300 ms,
genre/language selects, release segmented control, sort, pagination — all in the URL; old results stay visible while
loading; empty state with "Clear filters"; error state with retry), Movie detail (backdrop, poster, facts, languages,
trailer link with `noopener noreferrer`, synopsis, credits; 404 state). `useApiResource` hook (abort on change, stale
responses ignored), `utils/format.js` (IST dates/times, INR from paise).

**Verified.** Server 114 tests (16 new). Client 45 tests (10 new). Browser: home hero and grids with the original SVG
posters, catalogue search ("light" → 2 results, URL updated), Back-button sync of the search box, detail page, console
clean. Defects found and fixed during the epic: money formatted as "₹250.5" (now "₹250.50"); search box could re-apply
a stale search after Back; trailer link was a click handler instead of a real link. Note: in development React
StrictMode mounts twice, so each first request is aborted — the browser tool lists these as "503"; the API log shows
only 200/304 and "request aborted".

## Epic 3 — authentication and authorization (Done, `d5b2768`)

**Backend.** `services/authService.js` (register, login, rotate, logout, revoke-all, change password),
`services/tokenService.js` (HS256 JWT with issuer/audience, algorithm pinned; refresh token = 256 random bits,
stored as SHA-256), `middleware/auth.js` (`authenticate`, `optionalAuth`, `requireRole`, `requireAdmin`; user and
`tokenVersion` reloaded from the DB on every request), `middleware/originCheck.js` (CSRF: Origin/Referer must equal
`CLIENT_ORIGIN` for unsafe methods), `middleware/rateLimits.js` (express-rate-limit, in-memory), `utils/cookies.js`.
Admin bootstrap: `npm run create-admin` (env vars `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`).

Design details: refresh tokens slide (each rotated token is valid 7 days from issue); a reused token inside a 10 s
grace window returns 409 `REFRESH_CONFLICT` (two tabs refreshing at once) instead of revoking — documented
trade-off; login compares against a dummy hash for unknown emails (timing); registration reveals that an email is
taken (409) — accepted, no email verification in scope; passwords 8–72 bytes with a letter and a digit.

**Frontend.** Design system (`client/src/styles/*`: tokens, base, components, layout; dark theme, all text pairs
≥ 4.5:1 contrast), app shell with responsive header, `AuthProvider` + `useAuth`, `useSignOut`, route guards
(`RequireAuth`, `RequireAdmin`, `GuestOnly`; safe `?next=` handling), Login, Register, Account (rename, change
password, log out everywhere with confirmation dialog), Not-found, System status. `api/client.js` refreshes the
session once on 401 and retries once (shared refresh, no loops), with react-toastify notifications.

**Verified.** Server 98 tests (31 new auth/rate-limit/admin-script tests including 10 simultaneous registrations →
exactly 1 created, refresh reuse → family revoked, concurrent refresh → exactly 1 rotation, tampered/`alg:none`
tokens rejected, role change applies immediately, Origin check). Client 35 tests. **Browser (Chrome, real dev
servers):** registration with client validation, toast and signed-in header; `document.cookie` empty (httpOnly);
server-side logout effective; protected page → `/login?next=/account`; wrong password → generic error; correct
login → back to `/account`; console free of errors. Found and fixed in the browser: stale field errors stayed
visible after editing. **Not verified in browser:** mobile width (window resize had no effect — window maximised).

## Epic 2 — database models and seed data (Done, `6b870e5`)

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
| Backend tests | `cd server; npm test` | **185 passed**, 0 failed, 0 skipped |
| Backend lint | `cd server; npm run lint` | 0 problems |
| Frontend tests | `cd client; npm test` | **88 passed**, 0 failed |
| Frontend lint / build | `cd client; npm run lint; npm run build` | 0 problems / passed |
| Dependency audit | `npm audit` (both) | 0 vulnerabilities |
| Browser check | Chrome via browser integration | Customer journey, two-client real-time, admin flows, 390 px mobile layout verified |

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
- Rate limits use an in-memory store: correct for one server process only.
- The browser must use `http://localhost:5173` (the configured `CLIENT_ORIGIN`); `127.0.0.1:5173` fails the Origin check.

## Environment variables

Server (`server/.env`, template in `server/.env.example`): `NODE_ENV`, `PORT`, `MONGODB_URI`, `MONGODB_URI_TEST`,
`CLIENT_ORIGIN`, **`JWT_ACCESS_SECRET` (required)**, optional `BCRYPT_COST`, `COOKIE_SECURE`, `TRUST_PROXY`,
`RATE_LIMIT_ENABLED`, `LOG_LEVEL`, `LOG_PRETTY`. Script-only: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.
Client: optional `VITE_API_URL`.

## Setup

See [README.md](../README.md) for exact Windows PowerShell commands.
