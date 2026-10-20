import { useState } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../hooks/useAuth.js'
import { useSignOut } from '../hooks/useSignOut.js'
import * as authApi from '../api/auth.js'
import { errorMessage, fieldErrors } from '../api/client.js'
import { collectErrors, validateName, validateNewPassword } from '../utils/validation.js'
import FormField from '../components/ui/FormField.jsx'
import Button from '../components/ui/Button.jsx'
import Alert from '../components/ui/Alert.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'

const memberSince = (iso) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

function ProfileForm({ user, onSaved }) {
  const [name, setName] = useState(user.name)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (event) => {
    event.preventDefault()
    const problem = validateName(name)
    setError(problem)
    if (problem) return
    setSaving(true)
    const result = await authApi.updateProfile({ name: name.trim() })
    setSaving(false)
    if (result.ok) {
      onSaved(result.data.user)
      toast.success('Profile updated.')
    } else {
      setError(fieldErrors(result).name ?? errorMessage(result))
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <FormField label="Full name" error={error}>
        <input
          className="input"
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
      </FormField>
      <div>
        <Button type="submit" variant="primary" loading={saving} disabled={name.trim() === user.name}>
          Save name
        </Button>
      </div>
    </form>
  )
}

function PasswordForm({ onChanged }) {
  const empty = { currentPassword: '', newPassword: '', confirm: '' }
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(false)
  const update = (field) => (event) => {
    setForm((f) => ({ ...f, [field]: event.target.value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const found = collectErrors({
      currentPassword: form.currentPassword ? null : 'Enter your current password',
      newPassword: validateNewPassword(form.newPassword),
      confirm: form.confirm === form.newPassword ? null : 'Passwords do not match',
    })
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length) return
    setSaving(true)
    const result = await authApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
    setSaving(false)
    if (result.ok) {
      setForm(empty)
      onChanged(result.data.user)
      toast.success('Password changed. You have been logged out on your other devices.')
    } else if (result.data?.error?.code === 'INVALID_CURRENT_PASSWORD') {
      setErrors({ currentPassword: 'Current password is incorrect' })
    } else {
      setErrors(fieldErrors(result))
      setServerError(errorMessage(result))
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      {serverError && <Alert type="error">{serverError}</Alert>}
      <FormField label="Current password" error={errors.currentPassword}>
        <input className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={update('currentPassword')} />
      </FormField>
      <FormField label="New password" hint="At least 8 characters, with a letter and a number." error={errors.newPassword}>
        <input className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={update('newPassword')} />
      </FormField>
      <FormField label="Confirm new password" error={errors.confirm}>
        <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} />
      </FormField>
      <div>
        <Button type="submit" variant="primary" loading={saving}>
          Change password
        </Button>
      </div>
    </form>
  )
}

export default function AccountPage() {
  const { user, setUser, logoutAll } = useAuth()
  const signOut = useSignOut()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const onLogoutAll = async () => {
    setBusy(true)
    const result = await logoutAll()
    setBusy(false)
    setConfirmOpen(false)
    if (result.ok) {
      toast.success('You have been logged out on every device.')
      signOut('/')
    } else {
      toast.error(errorMessage(result))
    }
  }

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <h1>My account</h1>
          <p className="muted">
            {user.email} · Member since {memberSince(user.createdAt)}
            {user.role === 'admin' && (
              <>
                {' '}
                · <span className="badge badge-info">Administrator</span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card" aria-labelledby="profile-heading">
          <h2 id="profile-heading">Profile</h2>
          <ProfileForm key={user.name} user={user} onSaved={setUser} />
        </section>
        <section className="card" aria-labelledby="password-heading">
          <h2 id="password-heading">Password</h2>
          <PasswordForm onChanged={setUser} />
        </section>
        <section className="card" aria-labelledby="sessions-heading">
          <h2 id="sessions-heading">Sessions</h2>
          <p className="muted">Lost a device or used a shared computer? End every session, including this one.</p>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Log out everywhere
          </Button>
        </section>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Log out on every device?"
        confirmLabel="Log out everywhere"
        cancelLabel="Stay logged in"
        danger
        busy={busy}
        onConfirm={onLogoutAll}
        onCancel={() => setConfirmOpen(false)}
      >
        You&apos;ll need to log in again on this and every other device.
      </ConfirmDialog>
    </div>
  )
}
