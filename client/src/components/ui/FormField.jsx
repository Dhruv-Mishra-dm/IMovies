import { cloneElement, useId } from 'react'

/**
 * Wraps one form control with its label, optional hint and error message, and wires up the
 * accessibility attributes (label `for`, aria-describedby, aria-invalid) automatically.
 *
 * <FormField label="Email" error={errors.email} hint="We never share it">
 *   <input className="input" type="email" ... />
 * </FormField>
 */
export default function FormField({ label, hint, error, children }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined })}
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="error">
          {error}
        </span>
      )}
    </div>
  )
}
