import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as adminApi from '../../api/admin.js'
import { errorMessage } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import SeatMap from '../../components/showtimes/SeatMap.jsx'
import FormField from '../../components/ui/FormField.jsx'
import Button from '../../components/ui/Button.jsx'
import Alert from '../../components/ui/Alert.jsx'
import { PageLoader, ErrorState } from '../../components/ui/Feedback.jsx'
import { buildLayout, describeLayout, parseNumberList } from '../../utils/seatLayout.js'

const FORMATS = ['2D', '3D', 'IMAX', '4DX']
const DEFAULT_CATEGORIES = [
  { code: 'CLASSIC', name: 'Classic' },
  { code: 'PRIME', name: 'Prime' },
]
const nextLabel = (rows) => String.fromCharCode(65 + Math.min(rows.length, 25))
const toText = (list) => list.join(', ')

function initialRows(screen) {
  if (screen) return describeLayout(screen.layout).map((r) => ({ ...r, aisleAfter: toText(r.aisleAfter), accessible: toText(r.accessible), disabled: toText(r.disabled) }))
  return ['A', 'B', 'C', 'D'].map((label, i) => ({ label, category: i < 3 ? 'CLASSIC' : 'PRIME', seats: 10, offset: 0, aisleAfter: '5', accessible: '', disabled: '' }))
}

function ScreenEditor({ screen, theatreId }) {
  const navigate = useNavigate()
  const [name, setName] = useState(screen?.name ?? '')
  const [format, setFormat] = useState(screen?.format ?? '2D')
  const [categories, setCategories] = useState(screen?.layout.categories ?? DEFAULT_CATEGORIES)
  const [rows, setRows] = useState(() => initialRows(screen))
  const [problems, setProblems] = useState([])
  const [saving, setSaving] = useState(false)

  const layout = useMemo(
    () =>
      buildLayout({
        categories,
        rows: rows.map((r) => ({
          label: r.label.trim().toUpperCase(),
          category: r.category,
          seats: Math.max(0, Math.min(60, Number(r.seats) || 0)),
          offset: Math.max(0, Math.min(20, Number(r.offset) || 0)),
          aisleAfter: parseNumberList(r.aisleAfter),
          accessible: parseNumberList(r.accessible),
          disabled: parseNumberList(r.disabled),
        })),
      }),
    [categories, rows],
  )
  const bookable = layout.rows.reduce((n, r) => n + r.seats.filter((s) => !s.disabled).length, 0)
  const previewPrices = categories.map((c) => ({ category: c.code, name: c.name })) // prices are set per showtime

  const setRow = (index, field) => (e) => setRows((list) => list.map((r, i) => (i === index ? { ...r, [field]: e.target.value } : r)))
  const setCategory = (index, field) => (e) => {
    const value = field === 'code' ? e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') : e.target.value
    setCategories((list) => list.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  const onSave = async () => {
    setProblems([])
    if (!name.trim()) return setProblems(['Give the screen a name'])
    setSaving(true)
    const body = { name: name.trim(), format, layout }
    const res = screen ? await adminApi.updateScreen(screen.id, body) : await adminApi.createScreen(theatreId, body)
    setSaving(false)
    if (res.ok) {
      toast.success(screen ? 'Screen saved. Existing shows keep their old seat map; new shows use this one.' : 'Screen created.')
      navigate(`/admin/theatres/${theatreId}`)
    } else {
      // The server re-validates the whole layout and lists every problem.
      const details = res.data?.error?.details
      setProblems(Array.isArray(details) && details.length ? details.map((d) => d.message) : [errorMessage(res)])
    }
  }

  return (
    <div className="stack">
      <section className="card" aria-labelledby="screen-basics">
        <h2 id="screen-basics">Screen</h2>
        <div className="form-grid">
          <FormField label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Format">
            <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
              {FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      <section className="card" aria-labelledby="categories-heading">
        <div className="section-header">
          <h2 id="categories-heading">Seat categories</h2>
          <Button size="sm" onClick={() => setCategories((list) => [...list, { code: `CAT${list.length + 1}`, name: `Category ${list.length + 1}` }])} disabled={categories.length >= 10}>
            Add category
          </Button>
        </div>
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {categories.map((c, i) => (
            <div key={i} className="cluster">
              <input className="input" style={{ maxWidth: '10rem' }} aria-label={`Category ${i + 1} code`} value={c.code} onChange={setCategory(i, 'code')} />
              <input className="input" style={{ maxWidth: '14rem' }} aria-label={`Category ${i + 1} name`} value={c.name} onChange={setCategory(i, 'name')} />
              <Button size="sm" variant="ghost" disabled={categories.length <= 1} onClick={() => setCategories((list) => list.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="rows-heading">
        <div className="section-header">
          <h2 id="rows-heading">Rows</h2>
          <Button
            size="sm"
            onClick={() => setRows((list) => [...list, { label: nextLabel(list), category: categories[0]?.code, seats: 10, offset: 0, aisleAfter: '', accessible: '', disabled: '' }])}
            disabled={rows.length >= 30}
          >
            Add row
          </Button>
        </div>
        <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
          “Aisle after” leaves a gap after those seat numbers; “Indent” shifts the row right; lists are comma-separated seat numbers.
        </p>
        <div className="row-editor">
          <div className="row-editor-row row-editor-head" aria-hidden="true">
            <span>Row</span>
            <span>Category</span>
            <span>Seats</span>
            <span>Indent</span>
            <span>Aisle after</span>
            <span>Wheelchair</span>
            <span>Out of service</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="row-editor-row">
              <input className="input" aria-label={`Row ${i + 1} label`} value={r.label} maxLength={2} onChange={setRow(i, 'label')} />
              <select className="select" aria-label={`Row ${r.label} category`} value={r.category} onChange={setRow(i, 'category')}>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input className="input" aria-label={`Row ${r.label} seats`} inputMode="numeric" value={r.seats} onChange={setRow(i, 'seats')} />
              <input className="input" aria-label={`Row ${r.label} indent`} inputMode="numeric" value={r.offset} onChange={setRow(i, 'offset')} />
              <input className="input" aria-label={`Row ${r.label} aisle after`} value={r.aisleAfter} onChange={setRow(i, 'aisleAfter')} />
              <input className="input" aria-label={`Row ${r.label} wheelchair seats`} value={r.accessible} onChange={setRow(i, 'accessible')} />
              <input className="input" aria-label={`Row ${r.label} out of service seats`} value={r.disabled} onChange={setRow(i, 'disabled')} />
              <Button size="sm" variant="ghost" aria-label={`Remove row ${r.label}`} onClick={() => setRows((list) => list.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="preview-heading">
        <h2 id="preview-heading">Preview · {bookable} bookable seats</h2>
        <SeatMap seatMap={layout} prices={previewPrices} />
      </section>

      {problems.length > 0 && (
        <Alert type="error" title="The layout can't be saved yet">
          {problems.slice(0, 8).join(' · ')}
        </Alert>
      )}
      {screen && <Alert type="info">Changes apply to shows scheduled from now on. Existing shows and their bookings keep the seat map they were created with.</Alert>}
      <div className="form-actions">
        <Button variant="primary" onClick={onSave} loading={saving}>
          {screen ? 'Save screen' : 'Create screen'}
        </Button>
        <Button to={`/admin/theatres/${theatreId}`}>Cancel</Button>
      </div>
    </div>
  )
}

export default function AdminScreenEditorPage() {
  const { id, theatreId } = useParams()
  const isNew = !id
  const { result, reload } = useApiResource((signal) => (isNew ? Promise.resolve({ ok: true, data: {} }) : adminApi.getScreen(id, signal)), id ?? `new-${theatreId}`)
  if (!result) return <PageLoader />
  if (!result.ok) return <ErrorState message={errorMessage(result)} onRetry={reload} />
  const screen = isNew ? null : result.data.screen
  const owner = isNew ? theatreId : screen.theatre.id
  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted" style={{ marginBottom: 'var(--space-1)' }}>
            <Link to={`/admin/theatres/${owner}`}>{screen ? screen.theatre.name : 'Theatre'}</Link>
          </p>
          <h1>{isNew ? 'New screen' : `Edit ${screen.name}`}</h1>
        </div>
      </div>
      <ScreenEditor key={id ?? 'new'} screen={screen} theatreId={owner} />
    </>
  )
}
