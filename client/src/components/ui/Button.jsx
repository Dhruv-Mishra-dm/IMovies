import { Link } from 'react-router-dom'

/**
 * <Button variant="primary|secondary|ghost|danger" size="sm" loading block>
 * While `loading`, the button is disabled (prevents double submission) and shows a spinner.
 * Pass `to` to render a router link styled as a button.
 */
export default function Button({ variant = 'secondary', size, loading = false, block = false, to, className = '', children, disabled, ...rest }) {
  const classes = ['btn', variant !== 'secondary' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className]
    .filter(Boolean)
    .join(' ')
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}
