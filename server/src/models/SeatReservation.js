import mongoose from 'mongoose';

// One document per seat that is currently TAKEN for a showtime (free seats have no document).
//
// The unique index on (showtime, seatId) is THE double-booking guarantee: whatever the application
// does, MongoDB refuses to store two reservations for the same seat of the same show.
//
// HELD reservations carry `expiresAt`. Code treats a hold as free the moment expiresAt has passed,
// even before any clean-up runs; the booking engine deletes expired holds inside the same transaction
// that takes the seat. BOOKED reservations have no expiresAt and never expire.
export const RESERVATION_STATUS = Object.freeze({ HELD: 'HELD', BOOKED: 'BOOKED' });

const seatReservationSchema = new mongoose.Schema(
  {
    showtime: { type: mongoose.Schema.Types.ObjectId, ref: 'Showtime', required: true },
    seatId: { type: String, required: true, match: /^[A-Z]{1,2}\d{1,2}$/ },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: Object.values(RESERVATION_STATUS), required: true },
    // Required only for holds. (A plain validator would not run when the field is missing entirely.)
    expiresAt: {
      type: Date,
      required: [
        function isHold() {
          return this.status === RESERVATION_STATUS.HELD;
        },
        'HELD reservations need an expiry time',
      ],
    },
  },
  { timestamps: true, versionKey: false },
);

seatReservationSchema.index({ showtime: 1, seatId: 1 }, { unique: true });
seatReservationSchema.index({ booking: 1 }); // release/confirm all seats of a booking
// Safety net only: MongoDB removes holds that are 1 hour past expiry if nothing else did.
seatReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const SeatReservation = mongoose.model('SeatReservation', seatReservationSchema);
