import * as movieService from '../services/movieService.js';

export async function list(req, res) {
  res.json(await movieService.listPublicMovies(req.validated.query));
}

export async function filters(req, res) {
  res.json(await movieService.publicFilterOptions());
}

export async function detail(req, res) {
  res.json({ movie: await movieService.getPublicMovie(req.validated.params.idOrSlug) });
}

// ---------- Admin ----------

export async function adminList(req, res) {
  res.json(await movieService.listAllMovies(req.validated.query));
}

export async function adminDetail(req, res) {
  res.json({ movie: await movieService.getMovieForAdmin(req.validated.params.id) });
}

export async function create(req, res) {
  res.status(201).json({ movie: await movieService.createMovie(req.validated.body, req.user._id) });
}

export async function update(req, res) {
  res.json({ movie: await movieService.updateMovie(req.validated.params.id, req.validated.body, req.user._id) });
}

export async function publish(req, res) {
  res.json({ movie: await movieService.publishMovie(req.validated.params.id, req.user._id) });
}

export async function archive(req, res) {
  res.json({ movie: await movieService.archiveMovie(req.validated.params.id, req.user._id) });
}

export async function remove(req, res) {
  await movieService.deleteMovie(req.validated.params.id, req.user._id);
  res.status(204).end();
}
