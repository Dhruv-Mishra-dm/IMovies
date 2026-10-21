import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as adminApi from '../../api/admin.js'
import { errorMessage } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import Button from '../../components/ui/Button.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { PageLoader, ErrorState, EmptyState } from '../../components/ui/Feedback.jsx'
import { TheatreForm } from './AdminTheatresPage.jsx'

export default function AdminTheatreDetailPage() {
  const { id } = useParams()
  const { result, reload } = useApiResource((signal) => adminApi.getTheatre(id, signal), id)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!result) return <PageLoader />
  if (!result.ok) return <ErrorState message={errorMessage(result)} onRetry={reload} />
  const { theatre, screens } = result.data

  const toggleActive = async () => {
    setBusy(true)
    const res = await adminApi.updateTheatre(theatre.id, { isActive: !theatre.isActive })
    setBusy(false)
    setConfirm(false)
    if (res.ok) toast.success(theatre.isActive ? 'Theatre deactivated.' : 'Theatre activated.')
    else toast.error(errorMessage(res))
    reload()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted" style={{ marginBottom: 'var(--space-1)' }}>
            <Link to="/admin/theatres">Theatres</Link>
          </p>
          <h1>{theatre.name}</h1>
          <p className="muted">{theatre.isActive ? 'Active — visible to customers' : 'Inactive — hidden from customers'}</p>
        </div>
        <Button variant={theatre.isActive ? 'danger' : 'primary'} onClick={() => setConfirm(true)}>
          {theatre.isActive ? 'Deactivate' : 'Activate'}
        </Button>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="details-heading">
          <h2 id="details-heading">Details</h2>
          <TheatreForm key={theatre.updatedAt} theatre={theatre} onSaved={reload} />
        </section>
        <section className="card" aria-labelledby="screens-heading">
          <div className="section-header">
            <h2 id="screens-heading">Screens</h2>
            <Button size="sm" variant="primary" to={`/admin/theatres/${theatre.id}/screens/new`}>
              Add screen
            </Button>
          </div>
          {screens.length === 0 ? (
            <EmptyState title="No screens yet">Add a screen and design its seat layout.</EmptyState>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {screens.map((s) => (
                <li key={s.id} className="cluster" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <Link to={`/admin/screens/${s.id}`}>{s.name}</Link> <span className="faint">· {s.format} · {s.capacity} seats</span>
                    {!s.isActive && <span className="badge" style={{ marginLeft: 'var(--space-2)' }}>Inactive</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={confirm}
        title={theatre.isActive ? 'Deactivate this theatre?' : 'Activate this theatre?'}
        confirmLabel={theatre.isActive ? 'Deactivate' : 'Activate'}
        cancelLabel="Back"
        danger={theatre.isActive}
        busy={busy}
        onConfirm={toggleActive}
        onCancel={() => setConfirm(false)}
      >
        {theatre.isActive
          ? 'Customers will no longer see it. This is refused while upcoming shows exist — cancel them first.'
          : 'It will appear in the public theatre list again.'}
      </ConfirmDialog>
    </>
  )
}
