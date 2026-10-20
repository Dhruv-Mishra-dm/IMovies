import { useEffect, useRef } from 'react'
import Button from './Button.jsx'

/**
 * Confirmation for destructive actions, built on the native <dialog> element (focus trapping,
 * Escape to close and the backdrop come for free).
 *
 * <ConfirmDialog open={open} title="Cancel booking?" confirmLabel="Cancel booking" danger
 *   onConfirm={...} onCancel={() => setOpen(false)} busy={saving}>Explanation…</ConfirmDialog>
 */
export default function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', cancelLabel = 'Keep it', danger = false, busy = false, onConfirm, onCancel }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // Fall back to the `open` attribute where showModal() isn't implemented (very old browsers, jsdom).
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault() // Escape key: let React state decide
        if (!busy) onCancel()
      }}
    >
      {open && (
        <>
          <h2 id="confirm-title" style={{ fontSize: 'var(--text-xl)' }}>
            {title}
          </h2>
          <div className="muted">{children}</div>
          <div className="dialog-actions">
            <Button onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
              {confirmLabel}
            </Button>
          </div>
        </>
      )}
    </dialog>
  )
}
