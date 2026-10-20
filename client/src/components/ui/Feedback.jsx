import Button from './Button.jsx'
import Alert from './Alert.jsx'

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="page-loader" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <h2 style={{ fontSize: 'var(--text-xl)' }}>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

/** A failed load with an optional "Try again" button. */
export function ErrorState({ message, onRetry }) {
  return (
    <Alert
      type="error"
      title="Couldn't load this page"
      action={
        onRetry && (
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {message}
    </Alert>
  )
}
