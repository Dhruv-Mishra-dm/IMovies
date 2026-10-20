import { Link, useSearchParams } from 'react-router-dom'
import { listCities, listTheatres } from '../api/cinema.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import FormField from '../components/ui/FormField.jsx'
import { PageLoader, ErrorState, EmptyState } from '../components/ui/Feedback.jsx'

export default function TheatresPage() {
  const [params, setParams] = useSearchParams()
  const city = params.get('city') ?? ''
  const cities = useApiResource((signal) => listCities(signal), 'cities')
  const theatres = useApiResource((signal) => listTheatres(city ? { city } : {}, signal), city)

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <h1>Theatres</h1>
          <p className="muted">Pick a cinema to see everything it&apos;s showing.</p>
        </div>
        {cities.result?.ok && (
          <FormField label="City">
            <select className="select" value={city} onChange={(e) => setParams(e.target.value ? { city: e.target.value } : {})}>
              <option value="">All cities</option>
              {cities.result.data.cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </FormField>
        )}
      </div>
      {!theatres.result && <PageLoader label="Loading theatres…" />}
      {theatres.result && !theatres.result.ok && <ErrorState message={errorMessage(theatres.result)} onRetry={theatres.reload} />}
      {theatres.result?.ok &&
        (theatres.result.data.theatres.length === 0 ? (
          <EmptyState title="No theatres found">Try another city.</EmptyState>
        ) : (
          <ul className="theatre-list">
            {theatres.result.data.theatres.map((t) => (
              <li key={t.id} className="card theatre-card">
                <h2>
                  <Link to={`/theatres/${t.slug}`}>{t.name}</Link>
                </h2>
                <p className="muted" style={{ marginBottom: 'var(--space-2)' }}>
                  {t.address}
                </p>
                <p className="faint" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                  {t.city} · {t.screenCount} {t.screenCount === 1 ? 'screen' : 'screens'}
                  {t.amenities?.length > 0 && ` · ${t.amenities.join(', ')}`}
                </p>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
