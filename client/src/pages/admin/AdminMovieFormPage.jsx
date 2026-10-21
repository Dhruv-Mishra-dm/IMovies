import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as adminApi from '../../api/admin.js'
import { errorMessage, fieldErrors } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import FormField from '../../components/ui/FormField.jsx'
import Button from '../../components/ui/Button.jsx'
import Alert from '../../components/ui/Alert.jsx'
import { PageLoader, ErrorState } from '../../components/ui/Feedback.jsx'
import { istDateKey } from '../../utils/format.js'

// Same lists as the server (server/src/models/Movie.js); the server validates again.
const GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Horror', 'Musical', 'Mystery', 'Romance', 'Sci-Fi', 'Sports', 'Thriller']
const CERTIFICATIONS = ['U', 'UA 7+', 'UA 13+', 'UA 16+', 'A']

const splitList = (text) =>
  text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

function toForm(movie) {
  return {
    title: movie?.title ?? '',
    synopsis: movie?.synopsis ?? '',
    genres: movie?.genres ?? [],
    languages: (movie?.languages ?? []).join(', '),
    durationMins: movie ? String(movie.durationMins) : '',
    certification: movie?.certification ?? 'UA 13+',
    releaseDate: movie ? istDateKey(new Date(movie.releaseDate)) : '',
    director: movie?.director ?? '',
    cast: (movie?.cast ?? []).join(', '),
    posterUrl: movie?.posterUrl ?? '',
    backdropUrl: movie?.backdropUrl ?? '',
    trailerUrl: movie?.trailerUrl ?? '',
  }
}

function MovieForm({ movie }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => toForm(movie))
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(false)
  const update = (field) => (event) => {
    setForm((f) => ({ ...f, [field]: event.target.value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }
  const toggleGenre = (genre) =>
    setForm((f) => ({ ...f, genres: f.genres.includes(genre) ? f.genres.filter((g) => g !== genre) : [...f.genres, genre] }))

  const onSubmit = async (event) => {
    event.preventDefault()
    const local = {}
    if (!form.title.trim()) local.title = 'Enter a title'
    if (form.genres.length < 1 || form.genres.length > 5) local.genres = 'Choose 1 to 5 genres'
    if (splitList(form.languages).length === 0) local.languages = 'Enter at least one language'
    if (!/^\d+$/.test(form.durationMins) || Number(form.durationMins) < 30 || Number(form.durationMins) > 400) local.durationMins = 'Enter 30–400 minutes'
    if (!form.releaseDate) local.releaseDate = 'Choose a release date'
    setErrors(local)
    setServerError(null)
    if (Object.keys(local).length) return

    const body = {
      title: form.title.trim(),
      synopsis: form.synopsis.trim(),
      genres: form.genres,
      languages: splitList(form.languages),
      durationMins: Number(form.durationMins),
      certification: form.certification,
      releaseDate: form.releaseDate,
      director: form.director.trim(),
      cast: splitList(form.cast),
      posterUrl: form.posterUrl.trim(),
      backdropUrl: form.backdropUrl.trim(),
      trailerUrl: form.trailerUrl.trim(),
    }
    setSaving(true)
    const res = movie ? await adminApi.updateMovie(movie.id, body) : await adminApi.createMovie(body)
    setSaving(false)
    if (res.ok) {
      toast.success(movie ? 'Movie saved.' : 'Movie created as a draft. Publish it when ready.')
      navigate('/admin/movies')
    } else {
      setErrors(fieldErrors(res))
      setServerError(errorMessage(res))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {serverError && <Alert type="error">{serverError}</Alert>}
      <div className="form-grid" style={{ marginTop: 'var(--space-4)' }}>
        <FormField label="Title" error={errors.title}>
          <input className="input" value={form.title} onChange={update('title')} />
        </FormField>
        <FormField label="Release date (IST)" error={errors.releaseDate}>
          <input className="input" type="date" value={form.releaseDate} onChange={update('releaseDate')} />
        </FormField>
        <FormField label="Duration (minutes)" error={errors.durationMins}>
          <input className="input" inputMode="numeric" value={form.durationMins} onChange={update('durationMins')} />
        </FormField>
        <FormField label="Certificate" error={errors.certification}>
          <select className="select" value={form.certification} onChange={update('certification')}>
            {CERTIFICATIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </FormField>
        <fieldset className="field span-all">
          <legend style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>Genres (1–5)</legend>
          <div className="checkbox-group">
            {GENRES.map((g) => (
              <label key={g}>
                <input type="checkbox" checked={form.genres.includes(g)} onChange={() => toggleGenre(g)} /> {g}
              </label>
            ))}
          </div>
          {errors.genres && <span className="error">{errors.genres}</span>}
        </fieldset>
        <FormField label="Languages" hint="Comma-separated, e.g. Hindi, English" error={errors.languages}>
          <input className="input" value={form.languages} onChange={update('languages')} />
        </FormField>
        <FormField label="Director" error={errors.director}>
          <input className="input" value={form.director} onChange={update('director')} />
        </FormField>
        <div className="span-all">
          <FormField label="Cast" hint="Comma-separated" error={errors.cast}>
            <input className="input" value={form.cast} onChange={update('cast')} />
          </FormField>
        </div>
        <div className="span-all">
          <FormField label="Synopsis" error={errors.synopsis}>
            <textarea className="textarea" value={form.synopsis} onChange={update('synopsis')} maxLength={2000} />
          </FormField>
        </div>
        <FormField label="Poster URL" hint="https://… or /posters/name.svg" error={errors.posterUrl}>
          <input className="input" value={form.posterUrl} onChange={update('posterUrl')} />
        </FormField>
        <FormField label="Backdrop URL" hint="https://… or /backdrops/name.svg" error={errors.backdropUrl}>
          <input className="input" value={form.backdropUrl} onChange={update('backdropUrl')} />
        </FormField>
        <FormField label="Trailer URL" hint="https://…" error={errors.trailerUrl}>
          <input className="input" value={form.trailerUrl} onChange={update('trailerUrl')} />
        </FormField>
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary" loading={saving}>
          {movie ? 'Save changes' : 'Create draft'}
        </Button>
        <Button to="/admin/movies">Cancel</Button>
      </div>
    </form>
  )
}

export default function AdminMovieFormPage() {
  const { id } = useParams()
  const isNew = !id
  const { result, reload } = useApiResource((signal) => (isNew ? Promise.resolve({ ok: true, data: {} }) : adminApi.getMovie(id, signal)), id ?? 'new')
  if (!result) return <PageLoader />
  if (!result.ok) return <ErrorState message={errorMessage(result)} onRetry={reload} />
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{isNew ? 'Add movie' : `Edit “${result.data.movie.title}”`}</h1>
          {!isNew && <p className="muted">Status: {result.data.movie.status.toLowerCase()} · changing the duration only affects shows scheduled afterwards.</p>}
        </div>
      </div>
      <MovieForm key={id ?? 'new'} movie={isNew ? null : result.data.movie} />
    </>
  )
}
