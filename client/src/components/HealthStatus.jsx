import { useEffect, useState } from 'react'
import { fetchHealth } from '../api/health.js'

function describeHealth(result) {
  if (!result) return { tone: 'pending', label: 'Checking…' }
  switch (result.kind) {
    case 'ok':
      return { tone: 'up', label: 'API and database are healthy' }
    case 'unreachable':
      return { tone: 'down', label: 'API unreachable — is the server running?' }
    case 'timeout':
      return { tone: 'down', label: 'The API took too long to respond' }
    case 'invalid-response':
      return { tone: 'down', label: `Unexpected response from the server (HTTP ${result.status})` }
    default:
      // 'http-error': the API answered. 503 is its documented "database unavailable" answer.
      return result.status === 503
        ? { tone: 'warn', label: 'API is up, but the database is not available' }
        : { tone: 'down', label: `Unexpected response (HTTP ${result.status})` }
  }
}

export default function HealthStatus() {
  const [result, setResult] = useState(null)

  // Load once on mount. If the component unmounts first, abort the request
  // (the cancellation rejection is ignored) so we never set state on an unmounted component.
  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal).then(setResult, () => {})
    return () => controller.abort()
  }, [])

  const recheck = () => {
    setResult(null)
    fetchHealth().then(setResult)
  }

  const { tone, label } = describeHealth(result)
  const db = result?.data?.db

  return (
    <section className="card" aria-labelledby="status-heading">
      <h2 id="status-heading">System status</h2>
      {/* role="status" announces only this line to screen readers, not the whole card */}
      <p className={`status status-${tone}`} role="status">
        <span className="dot" aria-hidden="true" />
        {label}
      </p>
      {db && (
        <dl className="details">
          <dt>Database</dt>
          <dd>{db.connected ? db.name : db.state}</dd>
          <dt>Accepts writes</dt>
          <dd>{db.writable ? 'yes' : 'no'}</dd>
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
