import * as theatres from '../services/theatreService.js';
import * as showtimes from '../services/showtimeService.js';
import { cancelShowtime as cancelShowtimeAndBookings } from '../services/cancellationService.js';

// ---------- Public ----------

export async function listCities(req, res) {
  res.json({ cities: await theatres.listCities() });
}

export async function listTheatres(req, res) {
  res.json({ theatres: await theatres.listPublicTheatres(req.validated.query) });
}

export async function getTheatre(req, res) {
  res.json(await theatres.getPublicTheatre(req.validated.params.idOrSlug));
}

export async function listShowtimes(req, res) {
  res.json({ showtimes: await showtimes.listPublicShowtimes(req.validated.query) });
}

export async function listShowtimeDates(req, res) {
  res.json({ dates: await showtimes.listShowtimeDates(req.validated.query) });
}

export async function getShowtime(req, res) {
  res.json({ showtime: await showtimes.getPublicShowtime(req.validated.params.id) });
}

// ---------- Admin ----------

export async function adminListTheatres(req, res) {
  res.json({ theatres: await theatres.listAllTheatres() });
}

export async function adminGetTheatre(req, res) {
  res.json(await theatres.getTheatreForAdmin(req.validated.params.id));
}

export async function createTheatre(req, res) {
  res.status(201).json({ theatre: await theatres.createTheatre(req.validated.body, req.user._id) });
}

export async function updateTheatre(req, res) {
  res.json({ theatre: await theatres.updateTheatre(req.validated.params.id, req.validated.body, req.user._id) });
}

export async function createScreen(req, res) {
  res.status(201).json({ screen: await theatres.createScreen(req.validated.params.id, req.validated.body, req.user._id) });
}

export async function getScreen(req, res) {
  res.json({ screen: await theatres.getScreen(req.validated.params.id) });
}

export async function updateScreen(req, res) {
  res.json({ screen: await theatres.updateScreen(req.validated.params.id, req.validated.body, req.user._id) });
}

export async function deleteScreen(req, res) {
  await theatres.deleteScreen(req.validated.params.id, req.user._id);
  res.status(204).end();
}

export async function adminListShowtimes(req, res) {
  res.json(await showtimes.listAdminShowtimes(req.validated.query));
}

export async function createShowtime(req, res) {
  res.status(201).json({ showtime: await showtimes.createShowtime(req.validated.body, req.user._id) });
}

export async function updateShowtime(req, res) {
  res.json({ showtime: await showtimes.updateShowtime(req.validated.params.id, req.validated.body, req.user._id) });
}

/** Approved decision 5. Responds with the outcome; `cancellation.progress` is COMPLETED or PARTIAL (retry). */
export async function cancelShowtime(req, res) {
  const showtime = await cancelShowtimeAndBookings(req.user._id, req.validated.params.id, req.validated.body);
  res.json({ showtime: { id: showtime.id, status: showtime.status, cancellation: showtime.cancellation } });
}
