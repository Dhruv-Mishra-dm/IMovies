import { useParams } from 'react-router-dom'
import { getTheatre } from '../api/cinema.js'
import { errorMessage } from '../api/client.js'
import { useApiResource } from '../hooks/useApiResource.js'
import ShowtimePicker from '../components/showtimes/ShowtimePicker.jsx'
import Button from '../components/ui/Button.jsx'
import { PageLoader, ErrorState, EmptyState } from '../components/ui/Feedback.jsx'

export default function TheatreDetailPage() {
  const { slug } = useParams()
  const { result, reload } = useApiResource((signal) => getTheatre(slug, signal), slug)

  if (!result) return <PageLoader label="Loading theatre…" />
  if (!result.ok) {
    return (
      <div className="container page">
        {result.status === 404 ? (
          <EmptyState title="Theatre not found" action={<Button to="/theatres">All theatres</Button>}>
            This theatre doesn&apos;t exist or is closed.
          </EmptyState>
        ) : (
          <ErrorState message={errorMessage(result)} onRetry={reload} />
        )}
      </div>
    )
  }

  const { theatre, screens } = result.data
  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <h1>{theatre.name}</h1>
          <p className="muted">{theatre.address}</p>
          <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
            {screens.map((s) => `${s.name} (${s.format}, ${s.capacity} seats)`).join(' · ')}
            {theatre.amenities?.length > 0 && ` · ${theatre.amenities.join(', ')}`}
          </p>
        </div>
      </div>
      <ShowtimePicker theatreId={theatre.id} groupBy="movie" showCityFilter={false} />
    </div>
  )
}
