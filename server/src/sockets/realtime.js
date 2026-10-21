import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { Showtime } from '../models/index.js';
import { MOVIE_STATUS } from '../domain/statuses.js';
import { logger } from '../config/logger.js';
import { bus } from '../events/bus.js';
import { resolveUser } from '../middleware/auth.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { clock } from '../utils/clock.js';

const MAX_SHOW_ROOMS_PER_SOCKET = 3;
const MAX_JOINS_PER_MINUTE = 30;

const showRoom = (showtimeId) => `showtime:${showtimeId}`;
const userRoom = (userId) => `user:${userId}`;

function readCookie(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

/**
 * Real-time seat updates. The browser can only LISTEN: it may join/leave show rooms, but nothing it
 * sends changes any data. Every message here is forwarded from events/bus.js, which services publish
 * only after their database transaction committed — so a seat is never announced as booked unless it is.
 */
export function attachRealtime(httpServer, { clientOrigin }) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 10_000, // clients only send tiny join/leave messages
    cors: { origin: clientOrigin, credentials: true },
    // Only our own web app may open a socket (stops other sites hijacking a logged-in user's socket).
    allowRequest: (req, callback) => callback(null, req.headers.origin === clientOrigin),
  });

  // Identify the user from the same httpOnly cookie the REST API uses. Anonymous visitors are welcome
  // (seat maps are public); they just never receive personal events.
  io.use(async (socket, next) => {
    try {
      socket.data.user = await resolveUser(readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE));
    } catch {
      socket.data.user = null; // expired/invalid token: continue anonymously
    }
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (user) socket.join(userRoom(user._id));
    let joinsThisMinute = 0;
    const resetJoins = setInterval(() => (joinsThisMinute = 0), 60_000);
    resetJoins.unref();

    socket.on('showtime:join', async (showtimeId, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      joinsThisMinute += 1;
      if (joinsThisMinute > MAX_JOINS_PER_MINUTE) return ack({ ok: false, error: 'RATE_LIMITED' });
      if (typeof showtimeId !== 'string' || !/^[a-f\d]{24}$/i.test(showtimeId) || !mongoose.isValidObjectId(showtimeId)) {
        return ack({ ok: false, error: 'INVALID_ID' });
      }
      try {
        // Only real, public shows: guessing ids gives nothing beyond what GET /api/showtimes/:id/seats shows.
        const show = await Showtime.findById(showtimeId).select('movie').populate('movie', 'status');
        if (!show || show.movie?.status !== MOVIE_STATUS.PUBLISHED) return ack({ ok: false, error: 'NOT_FOUND' });
        const joined = [...socket.rooms].filter((r) => r.startsWith('showtime:'));
        for (const room of joined.slice(0, Math.max(0, joined.length - MAX_SHOW_ROOMS_PER_SOCKET + 1))) socket.leave(room);
        socket.join(showRoom(showtimeId));
        ack({ ok: true, serverTime: clock.now() });
      } catch (err) {
        logger.error({ err }, 'showtime:join failed');
        ack({ ok: false, error: 'SERVER_ERROR' });
      }
    });

    socket.on('showtime:leave', (showtimeId) => {
      if (typeof showtimeId === 'string') socket.leave(showRoom(showtimeId));
    });

    socket.on('disconnect', () => clearInterval(resetJoins));
  });

  // Forward committed domain events to the right rooms.
  const onSeats = ({ showtimeId, changes }) => io.to(showRoom(showtimeId)).emit('seats:changed', { showtimeId, changes, at: clock.now() });
  const onBooking = ({ userId, bookingId, status }) => io.to(userRoom(userId)).emit('booking:updated', { bookingId, status });
  const onCancelled = ({ showtimeId }) => io.to(showRoom(showtimeId)).emit('showtime:cancelled', { showtimeId });
  bus.on('seats.changed', onSeats);
  bus.on('booking.updated', onBooking);
  bus.on('showtime.cancelled', onCancelled);

  return {
    io,
    close: () =>
      new Promise((resolve) => {
        bus.off('seats.changed', onSeats);
        bus.off('booking.updated', onBooking);
        bus.off('showtime.cancelled', onCancelled);
        io.close(() => resolve());
      }),
  };
}
