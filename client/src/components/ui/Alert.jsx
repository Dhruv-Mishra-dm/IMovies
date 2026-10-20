/**
 * <Alert type="error|success|info|warning">message</Alert>
 * Errors use role="alert" so screen readers announce them immediately; others use role="status".
 */
export default function Alert({ type = 'info', title, children, action }) {
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <div className="stack" style={{ gap: 'var(--space-2)', flex: 1 }}>
        {title && <strong>{title}</strong>}
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  )
}
