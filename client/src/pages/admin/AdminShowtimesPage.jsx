import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as adminApi from '../../api/admin.js'
import { errorMessage } from '../../api/client.js'
import { useApiResource } from '../../hooks/useApiResource.js'
import Button from '../../components/ui/Button.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import FormField from '../../components/ui/FormField.jsx'
import Pagination from '../../components/ui/Pagination.jsx'
import { PageLoader, ErrorState, EmptyState } from '../../components/ui/Feedback.jsx'
import { formatDateTime, formatPrice } from '../../utils/format.js'
import { paiseToRupees, rupeesToPaise } from '../../utils/seatLayout.js'

function CancelDialog({ show, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const onConfirm = async () => {
    if (reason.trim().length < 3) return setError('Give a short reason (shown in the audit log)')
    setBusy(true)
    const res = await adminApi.cancelShowtime(show.id, reason.trim())
    setBusy(false)
    if (!res.ok) return setError(errorMessage(res))
    const c = res.data.showtime.cancellation
    if (c.progress === 'COMPLETED') toast.success(`Show cancelled: ${c.bookingsCancelled} booking(s) cancelled, ${c.refundsRecorded} refund(s) recorded.`)
    else toast.warning(`Show cancelled, but ${c.failedBookings} booking(s) could not be processed yet. Cancel again to retry; a background job also retries.`)
    onDone()
  }

  return (
    <ConfirmDialog open title="Cancel this show?" confirmLabel="Cancel show" cancelLabel="Keep show" danger busy={busy} onConfirm={onConfirm} onCancel={onClose}>
      <p>
        {show.movie.title} · {formatDateTime(show.startsAt)} · {show.theatre.name}, {show.screen.name}. Every booking for it is cancelled and paid bookings
        are refunded in full (simulated). This can&apos;t be undone.
      </p>
      <FormField label="Reason" error={error}>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </FormField>
    </ConfirmDialog>
  )
}

function PricesDialog({ show, onClose, onDone }) {
  const [values, setValues] = useState(() => Object.fromEntries(show.prices.map((p) => [p.category, paiseToRupees(p.amount)])))
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const onConfirm = async () => {
    const prices = Object.entries(values).map(([category, text]) => ({ category, amount: rupeesToPaise(text) }))
    if (prices.some((p) => p.amount === null)) return setError('Enter prices in rupees, e.g. 250 or 250.50')
    setBusy(true)
    const res = await adminApi.updateShowtime(show.id, { prices })
    setBusy(false)
    if (!res.ok) return setError(errorMessage(res))
    toast.success('Prices updated. Existing bookings keep the price they paid.')
    onDone()
  }

  return (
    <ConfirmDialog open title="Edit prices" confirmLabel="Save prices" cancelLabel="Back" busy={busy} onConfirm={onConfirm} onCancel={onClose}>
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        {show.prices.map((p) => (
          <FormField key={p.category} label={`${p.category} (₹)`}>
            <input className="input" inputMode="decimal" value={values[p.category]} onChange={(e) => setValues((v) => ({ ...v, [p.category]: e.target.value }))} />
          </FormField>
        ))}
        {error && <p className="error" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    </ConfirmDialog>
  )
}

export default function AdminShowtimesPage() {
  const [params, setParams] = useSearchParams()
  const when = params.get('when') ?? 'upcoming'
  const theatre = params.get('theatre') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = { when, ...(theatre && { theatre }), page }
  const list = useApiResource((signal) => adminApi.listShowtimes(query, signal), JSON.stringify(query))
  const theatres = useApiResource((signal) => adminApi.listTheatres(signal), 'theatres')
  const [dialog, setDialog] = useState(null) // { kind: 'cancel'|'prices', show }

  const set = (changes) => setParams(Object.fromEntries(Object.entries({ when, theatre, ...changes }).filter(([, v]) => v && v !== 'upcoming')))
  const close = () => setDialog(null)
  const done = () => {
    setDialog(null)
    list.reload()
  }

  return (
    <>
      <div className="page-header">
        <h1>Showtimes</h1>
        <Button to="/admin/showtimes/new" variant="primary">
          Schedule a show
        </Button>
      </div>
      <form className="toolbar" style={{ gridTemplateColumns: 'repeat(2, minmax(10rem, 16rem))' }} onSubmit={(e) => e.preventDefault()}>
        <FormField label="When">
          <select className="select" value={when} onChange={(e) => set({ when: e.target.value, page: '' })}>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="all">All</option>
          </select>
        </FormField>
        <FormField label="Theatre">
          <select className="select" value={theatre} onChange={(e) => set({ theatre: e.target.value, page: '' })}>
            <option value="">All theatres</option>
            {theatres.result?.ok &&
              theatres.result.data.theatres.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </FormField>
      </form>
      {!list.result && <PageLoader />}
      {list.result && !list.result.ok && <ErrorState message={errorMessage(list.result)} onRetry={list.reload} />}
      {list.result?.ok &&
        (list.result.data.items.length === 0 ? (
          <EmptyState title="No showtimes" action={<Button to="/admin/showtimes/new">Schedule a show</Button>} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Starts (IST)</th>
                    <th scope="col">Movie</th>
                    <th scope="col">Where</th>
                    <th scope="col">Seats left</th>
                    <th scope="col">From</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.result.data.items.map((s) => (
                    <tr key={s.id}>
                      <td>{formatDateTime(s.startsAt)}</td>
                      <td>
                        {s.movie.title}
                        <div className="faint">
                          {s.language} · {s.format}
                        </div>
                      </td>
                      <td>
                        {s.theatre.name}
                        <div className="faint">{s.screen.name}</div>
                      </td>
                      <td>
                        {s.seatsLeft} / {s.capacity}
                      </td>
                      <td>{formatPrice(s.priceFrom)}</td>
                      <td>
                        {s.status === 'CANCELLED' ? (
                          <span className="badge badge-danger" title={s.cancellation?.reason}>
                            Cancelled{s.cancellation?.progress === 'PARTIAL' ? ' (incomplete)' : ''}
                          </span>
                        ) : (
                          // Green only while bookable; a running or finished show is shown neutrally.
                          <span className={`badge${s.availability === 'OPEN' ? ' badge-success' : ''}`}>{s.availability === 'OPEN' ? 'Open' : s.availability.toLowerCase()}</span>
                        )}
                      </td>
                      <td className="actions-cell">
                        {s.availability === 'OPEN' && (
                          <Button size="sm" onClick={() => setDialog({ kind: 'prices', show: s })}>
                            Prices
                          </Button>
                        )}
                        {(s.status === 'SCHEDULED' ? s.availability !== 'COMPLETED' : s.cancellation?.progress === 'PARTIAL') && (
                          <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'cancel', show: s })}>
                            {s.status === 'SCHEDULED' ? 'Cancel' : 'Retry cancel'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.result.data.page} totalPages={list.result.data.totalPages} onChange={(p) => set({ page: String(p) })} />
          </>
        ))}
      {dialog?.kind === 'cancel' && <CancelDialog show={dialog.show} onClose={close} onDone={done} />}
      {dialog?.kind === 'prices' && <PricesDialog show={dialog.show} onClose={close} onDone={done} />}
    </>
  )
}
