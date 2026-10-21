import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { PageLoader } from '../../components/ui/Feedback.jsx'

const LINKS = [
  ['/admin', 'Dashboard', true],
  ['/admin/movies', 'Movies'],
  ['/admin/theatres', 'Theatres & screens'],
  ['/admin/showtimes', 'Showtimes'],
  ['/admin/bookings', 'Bookings'],
]

/** Shell for every admin page (the route itself is wrapped in RequireAdmin; the API checks again). */
export default function AdminLayout() {
  return (
    <div className="container page">
      <nav className="admin-nav" aria-label="Administration">
        {LINKS.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            {label}
          </NavLink>
        ))}
      </nav>
      {/* Pages load on demand; only this area waits, the admin navigation stays visible. */}
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </div>
  )
}
