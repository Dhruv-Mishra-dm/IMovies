import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { safeNextPath } from '../../utils/navigation.js'
import { PageLoader, EmptyState } from '../ui/Feedback.jsx'
import Button from '../ui/Button.jsx'

// These guards only decide what the browser SHOWS. The server checks every request again,
// so bypassing them in the browser gains nothing.

/** Logged-in users only; others go to /login and come back afterwards. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoader label="Checking your session…" />
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <Outlet />
}

/** Administrators only. */
export function RequireAdmin() {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoader label="Checking your session…" />
  if (status === 'anonymous') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (user.role !== 'admin') {
    return (
      <div className="container page">
        <EmptyState title="Administrators only" action={<Button to="/">Go to the home page</Button>}>
          Your account doesn&apos;t have access to this area.
        </EmptyState>
      </div>
    )
  }
  return <Outlet />
}

/**
 * Login/register pages: already logged-in users are sent on — to ?next= if present. This also runs
 * the moment a login succeeds, so it must honour ?next= (otherwise it would win the race against the
 * page's own navigate() and always send the user home).
 */
export function GuestOnly() {
  const { status } = useAuth()
  const [params] = useSearchParams()
  if (status === 'loading') return <PageLoader />
  if (status === 'authenticated') return <Navigate to={safeNextPath(params.get('next'))} replace />
  return <Outlet />
}
