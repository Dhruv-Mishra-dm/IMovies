import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as adminApi from '../../api/admin.js'
import { errorMessage, fieldErrors } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import FormField from '../../components/ui/FormField.jsx'
import Button from '../../components/ui/Button.jsx'
import Alert from '../../components/ui/Alert.jsx'
import { PageLoader, ErrorState } from '../../components/ui/Feedback.jsx'
import { formatDateTime, formatDuration, istDateKey } from '../../utils/format.js'
import { rupeesToPaise } from '../../utils/seatLayout.js'

export default function AdminShowtimeFormPage() {
  const navigate = useNavigate()
  // Lazy initialiser: today's date is read once, not on every render.
  const [form, setForm] = useState(() => ({ movieId: '', screenId: '', date: istDateKey(new Date()), time: '18:00', language: '' }))
  const [prices, setPrices] = useState({})
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(false)
  const movies = useApiResource((signal) => adminApi.listMovies({ status: 'PUBLISHED', pageSize: 100 }, signal), 'published')
  const theatres = useApiResource((signal) => adminApi.listTheatres(signal), 'theatres')
  // The chosen screen's seat categories: every one of them needs a price.
  const screenDetail = useApiResource(
    (signal) => (form.screenId ? adminApi.getScreen(form.screenId, signal) : Promise.resolve({ ok: true, data: null })),
    form.screenId || 'none',
  )

  if (!movies.result || !theatres.result) return <PageLoader />
  if (!movies.result.ok) return <ErrorState message={errorMessage(movies.result)} onRetry={movies.reload} />
  if (!theatres.result.ok) return <ErrorState message={errorMessage(theatres.result)} onRetry={theatres.reload} />

  const movieList = movies.result.data.items
  const screens = theatres.result.data.theatres
    .filter((t) => t.isActive)
    .flatMap((t) => t.screens.filter((s) => s.isActive).map((s) => ({ ...s, theatreName: t.name })))
  const movie = movieList.find((m) => m.id === form.movieId)
  const screen = screens.find((s) => s.id === form.screenId)
  const categories = screenDetail.result?.ok && screenDetail.result.data ? screenDetail.result.data.screen.layout.categories : []

  const update = (field) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [field]: value, ...(field === 'movieId' && { language: movieList.find((m) => m.id === value)?.languages[0] ?? '' }) }))
    setErrors((x) => ({ ...x, [field]: undefined }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const local = {}
    if (!form.movieId) local.movieId = 'Choose a movie'
    if (!form.screenId) local.screenId = 'Choose a screen'
    if (!form.date) local.date = 'Choose a date'
    if (!/^\d{2}:\d{2}$/.test(form.time)) local.time = 'Choose a time'
    const priceList = categories.map((c) => ({ category: c.code, amount: rupeesToPaise(prices[c.code]) }))
    if (form.screenId && (categories.length === 0 || priceList.some((p) => p.amount === null))) local.prices = 'Enter a price in rupees for every seat category'
    setErrors(local)
    setServerError(null)
    if (Object.keys(local).length) return
    setSaving(true)
    const res = await adminApi.createShowtime({ ...form, prices: priceList })
    setSaving(false)
    if (res.ok) {
      toast.success(`Scheduled for ${formatDateTime(res.data.showtime.startsAt)}.`)
      navigate('/admin/showtimes')
    } else {
      setErrors(fieldErrors(res))
      setServerError(errorMessage(res))
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Schedule a show</h1>
      </div>
      <form className="card" onSubmit={onSubmit} noValidate>
        {serverError && <Alert type="error">{serverError}</Alert>}
        <div className="form-grid" style={{ marginTop: 'var(--space-3)' }}>
          <FormField label="Movie (published)" error={errors.movieId}>
            <select className="select" value={form.movieId} onChange={update('movieId')}>
              <option value="">Choose…</option>
              {movieList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({formatDuration(m.durationMins)})
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Language" error={errors.language}>
            <select className="select" value={form.language} onChange={update('language')} disabled={!movie}>
              {(movie?.languages ?? []).map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Screen" error={errors.screenId}>
            <select className="select" value={form.screenId} onChange={update('screenId')}>
              <option value="">Choose…</option>
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.theatreName} — {s.name} ({s.format}, {s.capacity} seats)
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Date (IST)" error={errors.date}>
            <input className="input" type="date" value={form.date} onChange={update('date')} />
          </FormField>
          <FormField label="Start time (IST)" error={errors.time}>
            <input className="input" type="time" value={form.time} onChange={update('time')} />
          </FormField>
          {categories.map((c) => (
            <FormField key={c.code} label={`${c.name} price (₹)`}>
              <input
                className="input"
                inputMode="decimal"
                value={prices[c.code] ?? ''}
                onChange={(e) => {
                  setPrices((p) => ({ ...p, [c.code]: e.target.value }))
                  setErrors((x) => ({ ...x, prices: undefined }))
                }}
              />
            </FormField>
          ))}
        </div>
        {errors.prices && (
          <p className="error" style={{ color: 'var(--danger)' }}>
            {errors.prices}
          </p>
        )}
        <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
          {screen && movie
            ? `The screen is blocked for ${formatDuration(movie.durationMins)} plus 15 minutes of turnaround. Overlapping shows on ${screen.name} are refused.`
            : 'Choose a movie and a screen.'}
        </p>
        <div className="form-actions">
          <Button type="submit" variant="primary" loading={saving}>
            Schedule show
          </Button>
          <Button to="/admin/showtimes">Cancel</Button>
        </div>
      </form>
    </>
  )
}
