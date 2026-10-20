import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../hooks/useAuth.js'
import { useSignOut } from '../../hooks/useSignOut.js'
import Button from '../ui/Button.jsx'

const linkClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`

/** Links shown in the main navigation. Only routes that exist are listed (no dead links). */
const PRIMARY_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/movies', label: 'Movies' },
  { to: '/theatres', label: 'Theatres' },
]

export default function SiteHeader() {
  const { status, user, logout } = useAuth()
  const signOut = useSignOut()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const location = useLocation()
  const [lastPath, setLastPath] = useState(location.pathname)

  // Close the mobile menu after navigating (adjusting state during render, as React recommends).
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMenuOpen(false)
  }

  const onLogout = async () => {
    setLoggingOut(true)
    await logout() // even if the request failed, forget the user locally
    setLoggingOut(false)
    toast.success('You have been logged out.')
    signOut('/')
  }

  return (
    <header className="site-header">
      <div className="container">
        <Link to="/" className="brand" aria-label="IMovies home">
          I<span>Movies</span>
        </Link>
        <Button
          variant="ghost"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </Button>
        <nav id="site-nav" className={`site-nav${menuOpen ? ' open' : ''}`} aria-label="Main">
          <ul className="nav-links">
            {PRIMARY_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={link.end} className={linkClass}>
                  {link.label}
                </NavLink>
              </li>
            ))}
            {user?.role === 'admin' && (
              <li>
                <NavLink to="/admin" className={linkClass}>
                  Admin
                </NavLink>
              </li>
            )}
          </ul>
          <ul className="nav-account">
            {status === 'authenticated' && (
              <>
                <li>
                  <NavLink to="/account" className={linkClass}>
                    {user.name.split(' ')[0]}
                    <span className="visually-hidden">, your account</span>
                  </NavLink>
                </li>
                <li>
                  <Button variant="ghost" size="sm" onClick={onLogout} loading={loggingOut}>
                    Log out
                  </Button>
                </li>
              </>
            )}
            {status === 'anonymous' && (
              <>
                <li>
                  <NavLink to="/login" className={linkClass}>
                    Log in
                  </NavLink>
                </li>
                <li>
                  <Button to="/register" variant="primary" size="sm">
                    Sign up
                  </Button>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  )
}
