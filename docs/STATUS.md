# IMovies — Project Status

_Last updated: 2026-10-21 · Branch `main` · Baseline commit `c5b46e2`_

This file is the hand-over document: read it first after a break or context reset.
Only features whose acceptance criteria are verified are marked **Done**.

## Epic overview

| # | Epic | Status |
|---|---|---|
| 1 | Repository assessment and project foundation | **Done** (uncommitted — awaiting review) |
| 2 | Database models and seed data | Next |
| 3 | Authentication and authorization | Pending |
| 4 | Movie catalog and search | Pending |
| 5 | Theatres, screens and show scheduling | Pending |
| 6 | Seat inventory and booking engine | Pending |
| 7 | Payment simulation and booking confirmation | Pending |
| 8 | Real-time seat availability (Socket.IO) | Pending |
| 9 | Customer dashboard and booking history | Pending |
| 10 | Admin dashboard | Pending |
| 11 | Security, testing and optimization | Pending |
| 12 | Deployment and documentation | Pending |

## Epic 1 — what is done

Epic 0 (commit `c5b46e2`) built the skeleton. Epic 1 hardened it and fixed every defect from the read-only audit.

| Item | Where | Verified by |
|---|---|---|
| Env validation with zod; `PORT=abc` now exits cleanly (audit defect) | `server/src/config/env.js` | `tests/env.test.js` (incl. real server start-up) |
| Test-database guard: tests refuse any DB not ending in `_test` or equal to the dev DB | `config/env.js`, `tests/helpers/db.js`, `tests/setup-env.js` | `tests/env.test.js` |
| Structured JSON logging (pino), request ids, redaction of passwords/tokens/cookies | `config/logger.js`, `app.js` | `tests/logger.test.js`, live run |
| Consistent error format `{ error: { code, message, details?, requestId? } }` | `middleware/errorHandlers.js`, `utils/AppError.js` | `tests/errors.test.js` |
| Central request validation (`validate()` + `req.validated`), ObjectId checks | `middleware/validate.js`, `utils/validation.js` | `tests/errors.test.js` |
| Health = connected **and** writable primary; 2 s probe timeout (audit defect) | `config/db.js`, `controllers/health.controller.js` | `tests/health.test.js` |
| Fail fast when DB is down (`bufferCommands: false`) | `config/db.js` | code inspection |
| Graceful shutdown with 10 s timeout; unhandled rejection/exception handling; port-in-use message | `server.js` | code inspection |
| Client: axios wrapper with timeout; non-JSON 2xx no longer shown as healthy; proxy 502 shown as "unreachable" (audit defects) | `client/src/api/client.js`, `HealthStatus.jsx` | `client.test.js`, `HealthStatus.test.jsx`, live 502 check |
| Screen-reader announcement limited to the status line (audit note) | `HealthStatus.jsx` | `HealthStatus.test.jsx` (`role="status"`) |
| Server linting (oxlint), `.editorconfig`, `.gitattributes` (LF), extra `.gitignore` patterns | repo root, `server/` | `npm run lint` |

## Latest verified results (2026-10-21)

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd server; npm test` | **33 passed**, 0 failed, 0 skipped |
| Backend lint | `cd server; npm run lint` | 0 problems (17 files) |
| Frontend tests | `cd client; npm test` | **13 passed**, 0 failed |
| Frontend lint | `cd client; npm run lint` | 0 problems (9 files) |
| Frontend build | `cd client; npm run build` | Passed |
| Live API + Vite proxy | manual (PowerShell) | 200 health, 404/400 JSON errors, request ids, no cookie in logs, 502 when API stopped |
| Dependency audit | `npm install` output | 0 vulnerabilities (server and client) |
| Browser (visual) check | — | **Not performed** for this stage |

## Architectural decisions

| Decision | Choice | Reason |
|---|---|---|
| Env loading | Node's built-in `process.loadEnvFile` instead of `dotenv` | Same behaviour, one less dependency (Node ≥ 22). |
| Backend test runner | `node:test` + Supertest (not Jest/Vitest) | Already working in Epic 0, zero extra dependencies. Revisit only if a concrete need appears. |
| Linter | oxlint (ESLint-compatible rules) instead of ESLint | Scaffolded by Vite; much faster; same rule names. |
| Logging | pino + pino-http (pino-pretty in development) | Structured JSON, built-in redaction. |
| Validation | zod schemas; controllers read `req.validated` | Strips unknown fields (mass assignment) and rejects operator objects (NoSQL injection). |
| Frontend HTTP | axios instance + `apiRequest()` returning `{ ok, status, data, kind }` | Interceptors needed for token refresh in Epic 3; one place for error handling. |
| Frontend tests | Vitest 5 + React Testing Library + jsdom | Spec requirement; shares Vite config. |
| Database | MongoDB 8 single-node replica set in Docker, bound to 127.0.0.1 | Transactions require a replica set. |
| Auth (planned, Epic 3) | 15-min JWT access cookie + rotating 7-day refresh cookie, httpOnly, `SameSite=Strict`, Origin check on unsafe methods, `tokenVersion` revocation, bcryptjs cost 12 | Approved (decision 1 below). |

## Approved business decisions (confirmed by project owner, 2026-10-21)

| # | Decision | Affects |
|---|---|---|
| 1 | **Rotating refresh tokens, 7-day lifetime**, alongside 15-minute access tokens. Each refresh issues a new refresh token; reuse of an old one revokes the whole token family. | Epic 3 |
| 2 | **Full simulated refund** when a customer cancels **at least 120 minutes** before the show starts; no cancellation after that. | Epics 7, 9 |
| 3 | Currency **INR** (stored as integer paise), time zone **Asia/Kolkata**, **no taxes or fees** — the booking total is the sum of seat prices. | Epics 2, 5, 6 |
| 4 | A **failed simulated payment can be retried** until the **10-minute seat hold** expires; after expiry the seats are released. | Epics 6, 7 |
| 5 | When an **admin cancels a showtime**, all affected bookings are **automatically cancelled** and **simulated refunds are recorded**. | Epics 5, 10 |

## Known defects / limitations

- None open from the audit.
- `client` uses oxlint 1.89.0 (from the Vite scaffold), `server` uses 1.87.0 — harmless; align later.
- Frontend is still the Epic 0 status page; real UI starts in later epics.

## Environment variables

Server (`server/.env`, template in `server/.env.example`): `NODE_ENV`, `PORT`, `MONGODB_URI`, `MONGODB_URI_TEST`,
`CLIENT_ORIGIN`, optional `LOG_LEVEL`, `LOG_PRETTY`. Client: optional `VITE_API_URL`.

## Setup

See [README.md](../README.md) for exact Windows PowerShell commands.
