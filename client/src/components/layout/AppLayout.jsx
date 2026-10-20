import { Link, Outlet } from 'react-router-dom'
import SiteHeader from './SiteHeader.jsx'

export default function AppLayout() {
  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">
          <span>IMovies — a demo cinema booking system. Payments are simulated; no real money is taken.</span>
          <Link to="/status">System status</Link>
        </div>
      </footer>
    </div>
  )
}
