import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as adminApi from '../../api/admin.js'
import { errorMessage } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import Button from '../../components/ui/Button.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import FormField from '../../components/ui/FormField.jsx'
import Pagination from '../../components/ui/Pagination.jsx'
import { PageLoader, ErrorState, EmptyState } from '../../components/ui/Feedback.jsx'
import { formatLongDate } from '../../utils/format.js'

const STATUS_TONES = { DRAFT: 'warning', PUBLISHED: 'success', ARCHIVED: '' }

const ACTIONS = {
  publish: { label: 'Publish', run: adminApi.publishMovie, done: 'Movie published.', confirm: 'Publish this movie? It will appear in the public catalogue.' },
  archive: { label: 'Archive', run: adminApi.archiveMovie, done: 'Movie archived.', confirm: 'Archive this movie? It will disappear from the public catalogue. This is refused while upcoming shows exist.' },
  delete: { label: 'Delete', run: adminApi.deleteMovie, done: 'Movie deleted.', confirm: 'Delete this draft permanently? Only never-scheduled drafts can be deleted.', danger: true },
}

export default function AdminMoviesPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = { ...(q && { q }), ...(status && { status }), page }
  const { result, reload } = useApiResource((signal) => adminApi.listMovies(query, signal), JSON.stringify(query))
  const [pending, setPending] = useState(null) // { action, movie }
  const [busy, setBusy] = useState(false)

  const set = (changes) => {
    const next = { q, status, ...changes }
    // Typing in the search box replaces the history entry instead of adding one per keystroke.
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: 'q' in changes })
  }

  const onConfirm = async () => {
    const action = ACTIONS[pending.action]
    setBusy(true)
    const res = await action.run(pending.movie.id)
    setBusy(false)
    setPending(null)
    if (res.ok) toast.success(action.done)
    else toast.error(errorMessage(res))
    reload()
  }

  return (
    <>
      <div className="page-header">
        <h1>Movies</h1>
        <Button to="/admin/movies/new" variant="primary">
          Add movie
        </Button>
      </div>
      <form className="toolbar" style={{ gridTemplateColumns: 'minmax(12rem, 2fr) minmax(9rem, 1fr)' }} onSubmit={(e) => e.preventDefault()}>
        <FormField label="Search titles">
          <input className="input" type="search" defaultValue={q} onChange={(e) => set({ q: e.target.value.trim() })} />
        </FormField>
        <FormField label="Status">
          <select className="select" value={status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any status</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </FormField>
      </form>
      {!result && <PageLoader />}
      {result && !result.ok && <ErrorState message={errorMessage(result)} onRetry={reload} />}
      {result?.ok &&
        (result.data.items.length === 0 ? (
          <EmptyState title="No movies found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Release</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link to={`/admin/movies/${m.id}`}>{m.title}</Link>
                        <div className="faint">{m.genres.join(', ')}</div>
                      </td>
                      <td>{formatLongDate(m.releaseDate)}</td>
                      <td>
                        <span className={`badge${STATUS_TONES[m.status] ? ` badge-${STATUS_TONES[m.status]}` : ''}`}>{m.status.toLowerCase()}</span>
                      </td>
                      <td className="actions-cell">
                        <Button size="sm" to={`/admin/movies/${m.id}`}>
                          Edit
                        </Button>
                        {m.status !== 'PUBLISHED' && (
                          <Button size="sm" onClick={() => setPending({ action: 'publish', movie: m })}>
                            Publish
                          </Button>
                        )}
                        {m.status === 'PUBLISHED' && (
                          <Button size="sm" onClick={() => setPending({ action: 'archive', movie: m })}>
                            Archive
                          </Button>
                        )}
                        {m.status === 'DRAFT' && (
                          <Button size="sm" variant="danger" onClick={() => setPending({ action: 'delete', movie: m })}>
                            Delete
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={result.data.page} totalPages={result.data.totalPages} onChange={(p) => set({ page: String(p) })} />
          </>
        ))}
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? `${ACTIONS[pending.action].label} “${pending.movie.title}”?` : ''}
        confirmLabel={pending ? ACTIONS[pending.action].label : ''}
        cancelLabel="Back"
        danger={pending ? Boolean(ACTIONS[pending.action].danger) : false}
        busy={busy}
        onConfirm={onConfirm}
        onCancel={() => setPending(null)}
      >
        {pending && ACTIONS[pending.action].confirm}
      </ConfirmDialog>
    </>
  )
}
