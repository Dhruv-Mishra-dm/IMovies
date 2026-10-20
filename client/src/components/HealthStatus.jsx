import { useEffect, useState } from 'react'
import { fetchHealth } from '../api/health.js'

function describe(result) {
  if (!result) return { tone: 'pending', label: 'Checking…' }
  if (result.status === 0) return { tone: 'down', label: 'API unreachable — is the server running?' }
  if (result.ok) return { tone: 'up', label: 'API and database are healthy' }
  if (result.status === 503) return { tone: 'warn', label: 'API is up, but the database is not connected' }
  return { tone: 'down', label: `Unexpected response (HTTP ${result.status})` }
}

export default function HealthStatus() {
  const [result, setResult] = useState(null)

  // Load once on mount. If the component unmounts first, abort the request
  // (the AbortError is ignored) so we never set state on an unmounted component.
  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal).then(setResult, () => {})
    return () => controller.abort()
  }, [])

  const recheck = () => {
    setResult(null)
    fetchHealth().then(setResult)
  }

  const { tone, label } = describe(result)
  const db = result?.data?.db

  return (
    <section className="card" aria-live="polite">
      <h2>System status</h2>
      <p className={`status status-${tone}`}>
        <span className="dot" aria-hidden="true" />
        {label}
      </p>
      {db && (
        <dl className="details">
          <dt>Database</dt>
          <dd>{db.connected ? db.name : db.state}</dd>
          <dt>Replica set</dt>
          <dd>{db.replicaSet ?? '—'}</dd>
          <dt>Transactions</dt>
          <dd>{db.transactionsSupported ? 'supported' : 'not supported'}</dd>
          <dt>API uptime</dt>
          <dd>{result.data.uptimeSeconds}s</dd>
        </dl>
      )}
      <button type="button" onClick={recheck} disabled={!result}>
        Check again
      </button>
    </section>
  )
}
