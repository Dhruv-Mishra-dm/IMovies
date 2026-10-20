import HealthStatus from './components/HealthStatus.jsx'

export default function App() {
  return (
    <main className="container">
      <header>
        <h1>IMovies</h1>
        <p className="tagline">Cinema ticket booking — development build</p>
      </header>
      <HealthStatus />
    </main>
  )
}
