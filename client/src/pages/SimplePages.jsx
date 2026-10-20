import Button from '../components/ui/Button.jsx'
import { EmptyState } from '../components/ui/Feedback.jsx'
import HealthStatus from '../components/HealthStatus.jsx'

export function NotFoundPage() {
  return (
    <div className="container page">
      <EmptyState title="Page not found" action={<Button to="/" variant="primary">Back to the home page</Button>}>
        The page you were looking for doesn&apos;t exist or has moved.
      </EmptyState>
    </div>
  )
}

export function StatusPage() {
  return (
    <div className="container page" style={{ maxWidth: '40rem' }}>
      <h1>System status</h1>
      <HealthStatus />
    </div>
  )
}
