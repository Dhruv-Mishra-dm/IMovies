import { useAuth } from '../hooks/useAuth.js'
import Button from '../components/ui/Button.jsx'

// Temporary home page for the authentication milestone; replaced by the movie showcase in Epic 4.
export default function HomePage() {
  const { status, user } = useAuth()
  return (
    <div className="container page">
      <h1>Your next film starts here</h1>
      <p className="muted" style={{ maxWidth: '40rem' }}>
        IMovies lets you browse what&apos;s showing, pick the exact seats you want and book in under a minute.
      </p>
      {status === 'anonymous' && (
        <div className="cluster">
          <Button to="/register" variant="primary">
            Create an account
          </Button>
          <Button to="/login">Log in</Button>
        </div>
      )}
      {status === 'authenticated' && <p>Signed in as {user.name}.</p>}
    </div>
  )
}
