import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as adminApi from '../../api/admin.js'
import { errorMessage, fieldErrors } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import Button from '../../components/ui/Button.jsx'
import FormField from '../../components/ui/FormField.jsx'
import Alert from '../../components/ui/Alert.jsx'
import { PageLoader, ErrorState, EmptyState } from '../../components/ui/Feedback.jsx'

/** Create or edit a theatre. `theatre` = null for a new one. */
export function TheatreForm({ theatre, onSaved }) {
  const [form, setForm] = useState({
    name: theatre?.name ?? '',
    city: theatre?.city ?? '',
    address: theatre?.address ?? '',
    amenities: (theatre?.amenities ?? []).join(', '),
  })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(false)
  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((x) => ({ ...x, [field]: undefined }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const local = {}
    if (form.name.trim().length < 2) local.name = 'Enter the theatre name'
    if (form.city.trim().length < 2) local.city = 'Enter the city'
    if (form.address.trim().length < 5) local.address = 'Enter the full address'
    setErrors(local)
    setServerError(null)
    if (Object.keys(local).length) return
    const body = {
      name: form.name.trim(),
      city: form.city.trim(),
      address: form.address.trim(),
      amenities: form.amenities.split(',').map((a) => a.trim()).filter(Boolean),
    }
    setSaving(true)
    const res = theatre ? await adminApi.updateTheatre(theatre.id, body) : await adminApi.createTheatre(body)
    setSaving(false)
    if (res.ok) {
      toast.success(theatre ? 'Theatre saved.' : 'Theatre created. Now add its screens.')
      onSaved(res.data.theatre)
    } else {
      setErrors(fieldErrors(res))
      setServerError(errorMessage(res))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {serverError && <Alert type="error">{serverError}</Alert>}
      <div className="form-grid" style={{ marginTop: 'var(--space-3)' }}>
        <FormField label="Name" error={errors.name}>
          <input className="input" value={form.name} onChange={update('name')} />
        </FormField>
        <FormField label="City" error={errors.city}>
          <input className="input" value={form.city} onChange={update('city')} />
        </FormField>
        <div className="span-all">
          <FormField label="Address" error={errors.address}>
            <input className="input" value={form.address} onChange={update('address')} />
          </FormField>
        </div>
        <div className="span-all">
          <FormField label="Amenities" hint="Comma-separated, e.g. Recliners, Parking" error={errors.amenities}>
            <input className="input" value={form.amenities} onChange={update('amenities')} />
          </FormField>
        </div>
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary" loading={saving}>
          {theatre ? 'Save theatre' : 'Create theatre'}
        </Button>
      </div>
    </form>
  )
}

export default function AdminTheatresPage() {
  const { result, reload } = useApiResource((signal) => adminApi.listTheatres(signal), 'theatres')
  const [creating, setCreating] = useState(false)

  return (
    <>
      <div className="page-header">
        <h1>Theatres &amp; screens</h1>
        {!creating && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            Add theatre
          </Button>
        )}
      </div>
      {creating && (
        <section className="card" style={{ marginBottom: 'var(--space-5)' }} aria-labelledby="new-theatre">
          <h2 id="new-theatre">New theatre</h2>
          <TheatreForm
            theatre={null}
            onSaved={() => {
              setCreating(false)
              reload()
            }}
          />
          <Button variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </section>
      )}
      {!result && <PageLoader />}
      {result && !result.ok && <ErrorState message={errorMessage(result)} onRetry={reload} />}
      {result?.ok &&
        (result.data.theatres.length === 0 ? (
          <EmptyState title="No theatres yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Theatre</th>
                  <th scope="col">City</th>
                  <th scope="col">Screens</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.theatres.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/admin/theatres/${t.id}`}>{t.name}</Link>
                    </td>
                    <td>{t.city}</td>
                    <td>{t.screens.map((s) => `${s.name} (${s.capacity})`).join(', ') || '—'}</td>
                    <td>
                      <span className={`badge ${t.isActive ? 'badge-success' : ''}`}>{t.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  )
}
