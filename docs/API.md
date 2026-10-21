# API reference

All endpoints are under `/api` and exchange JSON. Errors always have the shape

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [], "requestId": "…" } }
```

- State-changing requests (POST, PUT, PATCH, DELETE) must come from `CLIENT_ORIGIN` (Origin check).
- Authentication uses httpOnly cookies set by the auth endpoints; there are no bearer tokens.
- Money is in **paise** (₹1 = 100 paise). Instants are ISO-8601 UTC in responses; admin inputs use IST
  calendar dates (`YYYY-MM-DD`) and times (`HH:MM`).
- Unknown fields are ignored; invalid parameters return `400 VALIDATION_ERROR` with field details.

## Health

| Endpoint | Purpose |
|---|---|
| `GET /health` | 200 when MongoDB is connected and writable, otherwise 503 |

## Auth — `/api/auth`

| Endpoint | Access | Purpose |
|---|---|---|
| `POST /register` `{ name, email, password }` | public, rate-limited | Create a customer account and log in |
| `POST /login` `{ email, password }` | public, rate-limited | Log in; wrong password and unknown email give the same error |
| `POST /refresh` | refresh cookie | Rotate tokens; reusing an old refresh token ends the session family |
| `POST /logout` | anyone | End this session |
| `POST /logout-all` | logged in | End every session of the user |
| `GET /me` · `PATCH /me` `{ name }` | logged in | Read / rename the current user |
| `POST /change-password` `{ currentPassword, newPassword }` | logged in | Change password; other sessions end |

## Catalogue, theatres and showtimes (public)

| Endpoint | Purpose |
|---|---|
| `GET /movies?q=&genre=&language=&release=all\|now-showing\|coming-soon&sort=release-desc\|release-asc\|title&page=&pageSize=` | Published movies, paginated: `{ items, page, pageSize, total, totalPages }` |
| `GET /movies/filters` | Genres and languages present in the catalogue |
| `GET /movies/:idOrSlug` | One published movie (drafts and archived movies → 404) |
| `GET /cities` · `GET /theatres?city=` · `GET /theatres/:idOrSlug` | Active theatres and their screens |
| `GET /showtimes?movie=&theatre=&city=&date=YYYY-MM-DD` | Upcoming bookable shows (default: next 7 days) with `priceFrom`, `capacity`, `seatsLeft` |
| `GET /showtimes/dates?movie=&theatre=&city=` | IST dates in the next 14 days that have shows |
| `GET /showtimes/:id` | One show with its seat map, named prices and `availability` (`OPEN`, `STARTED`, `COMPLETED`, `CANCELLED`) |
| `GET /showtimes/:id/seats` | Taken seats `{ A1: 'booked' \| 'held' \| 'mine' }`, the caller's active hold, `serverTime` |

## Bookings

Listing and viewing bookings requires a login; holding, paying, releasing and cancelling require a
customer account (administrators can't book). Other customers' bookings return 404.

| Endpoint | Purpose |
|---|---|
| `POST /bookings` `{ showtimeId, seatIds }` | Hold up to 10 seats for 10 minutes → `HELD` booking. `409 SEATS_UNAVAILABLE` lists seats already taken |
| `GET /bookings?scope=upcoming\|past\|all` | The caller's bookings |
| `GET /bookings/:id` | One booking with payments, refunds, server-computed `cancellation` eligibility and `serverTime` |
| `POST /bookings/:id/release` | Give up a hold (idempotent) |
| `POST /bookings/:id/payments` `{ outcome }` + header `Idempotency-Key` | Demo payment attempt; `outcome` is `SUCCESS`, `DECLINED` or `INSUFFICIENT_FUNDS`. `201` with the result; a repeated key returns the original result (`200`); `409 HOLD_EXPIRED` after the hold expired |
| `POST /bookings/:id/cancel` | Cancel a confirmed booking at least 120 minutes before the show (full simulated refund) |

## Administration — `/api/admin` (admin accounts)

| Endpoint | Purpose |
|---|---|
| `GET /stats` | Dashboard figures (last 30 days revenue and refunds, tickets, 7-day occupancy, top movies, recent bookings) |
| `GET /movies?q=&status=` · `GET /movies/:id` | All movies, any status |
| `POST /movies` · `PATCH /movies/:id` | Create (always as `DRAFT`) / edit |
| `POST /movies/:id/publish` · `POST /movies/:id/archive` | Status changes (archiving is refused while upcoming shows exist) |
| `DELETE /movies/:id` | Only never-scheduled drafts |
| `GET /theatres` · `POST /theatres` · `GET /theatres/:id` · `PATCH /theatres/:id` | Theatres (deactivation is refused while upcoming shows exist) |
| `POST /theatres/:id/screens` · `GET /screens/:id` · `PATCH /screens/:id` · `DELETE /screens/:id` | Screens and seat layouts; layout edits only affect shows scheduled afterwards |
| `GET /showtimes?when=upcoming\|past\|all&theatre=&page=` · `POST /showtimes` | List / schedule (IST `date` and `time`, a price in paise for every seat category). Overlaps, including turnaround, → `409 SHOWTIME_OVERLAP` |
| `PATCH /showtimes/:id` | Edit prices or language; the time only while no seats are held or booked |
| `POST /showtimes/:id/cancel` `{ reason }` | Cancel a show: every booking is cancelled and paid ones refunded; the outcome is reported and the request can be repeated |
| `GET /bookings?q=&status=&showtime=&page=` · `GET /bookings/:id` | Booking lookup by reference, customer email or name, status or show |

## Real-time events (Socket.IO, path `/socket.io`)

| Direction | Event | Meaning |
|---|---|---|
| client → server | `showtime:join` (showtimeId, ack) · `showtime:leave` | Start / stop watching one show (max 3 at a time) |
| server → client | `seats:changed` `{ showtimeId, changes: [{ seatId, state }] }` | Seats became `held`, `booked` or `available` |
| server → client | `showtime:cancelled` `{ showtimeId }` | The show was cancelled |
| server → client | `booking:updated` `{ bookingId, status }` | One of the user's own bookings changed (sent only to that user) |

Connections are accepted only from `CLIENT_ORIGIN`; the access-token cookie identifies the user
(anonymous visitors can watch seat maps but receive no personal events).
