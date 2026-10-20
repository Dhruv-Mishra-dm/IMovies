# IMovies

A cinema ticket booking and management system built with the MERN stack
(MongoDB, Express, React, Node.js).

> **Status:** Epic 0 — project foundation. The app currently shows a system
> status page that checks the API and database. Booking features come in later epics.

## Project layout

```
IMovies/
├── client/               React + Vite frontend (http://localhost:5173)
│   └── src/
│       ├── api/          functions that call the backend
│       └── components/   reusable UI pieces
├── server/               Express API (http://localhost:5000)
│   ├── src/
│   │   ├── config/       environment variables, database connection
│   │   ├── routes/       URL → controller mapping
│   │   ├── controllers/  turn HTTP requests into responses
│   │   ├── middleware/   404 + error handling (auth comes in Epic 1)
│   │   ├── app.js        builds the Express app (used by tests too)
│   │   └── server.js     connects to MongoDB, then starts listening
│   └── tests/            automated tests (node:test + supertest)
└── docker-compose.yml    local MongoDB 8 (single-node replica set)
```

## Prerequisites

| Tool | Version used | Check with |
|---|---|---|
| Node.js | 22 or newer (developed on 24) | `node -v` |
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
```

`.env` holds your local settings and is ignored by Git. The defaults in
`.env.example` work as-is for local development.

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

Open http://localhost:5173. You should see **"API and database are healthy"**.
Press `Ctrl+C` in each window to stop.

You can also call the health endpoint directly:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

## Checks and tests

```powershell
# Backend tests (MongoDB must be running — they use the separate imovies_test database)
cd C:\Users\Lenovo\Desktop\IMovies\server
npm test

# Frontend lint and production build
cd C:\Users\Lenovo\Desktop\IMovies\client
npm run lint
npm run build
```

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

## Security plan for authentication (Epic 1)

- JWT stored in an **httpOnly** cookie (JavaScript can't read it, so XSS can't steal it).
- `SameSite=Lax` in development; `Secure` (HTTPS-only) in production.
- **CSRF protection** for state-changing requests (POST/PUT/PATCH/DELETE): a
  CSRF token checked by the server, plus an Origin header check against the allowlist.
- Real secrets (e.g. `JWT_SECRET`) go only in `server/.env`, never in Git.
  `.env.example` contains placeholders only.
