import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../hooks/useAuth.js'
import { errorMessage } from '../api/client.js'
import { safeNextPath } from '../utils/navigation.js'
import { collectErrors, validateEmail } from '../utils/validation.js'
import FormField from '../components/ui/FormField.jsx'
import Button from '../components/ui/Button.jsx'
import Alert from '../components/ui/Alert.jsx'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Editing a field clears its (now possibly outdated) error message.
  const update = (field) => (event) => {
    setForm((f) => ({ ...f, [field]: event.target.value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const found = collectErrors({ email: validateEmail(form.email), password: form.password ? null : 'Enter your password' })
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length) return

    setSubmitting(true)
    const result = await login({ email: form.email.trim(), password: form.password })
    setSubmitting(false)
    if (result.ok) {
      toast.success(`Welcome back, ${result.data.user.name.split(' ')[0]}!`)
      navigate(next, { replace: true })
    } else {
      setServerError(errorMessage(result))
    }
  }

  return (
    <div className="container auth-page">
      <section className="card auth-card" aria-labelledby="login-heading">
        <h1 id="login-heading">Log in</h1>
        <p className="muted">Book seats, manage your tickets and see your booking history.</p>
        <form onSubmit={onSubmit} noValidate>
          {serverError && <Alert type="error">{serverError}</Alert>}
          <FormField label="Email" error={errors.email}>
            <input className="input" type="email" autoComplete="email" value={form.email} onChange={update('email')} />
          </FormField>
          <FormField label="Password" error={errors.password}>
            <input className="input" type="password" autoComplete="current-password" value={form.password} onChange={update('password')} />
          </FormField>
          <Button type="submit" variant="primary" block loading={submitting}>
            Log in
          </Button>
        </form>
        <p className="muted" style={{ marginTop: 'var(--space-5)', marginBottom: 0 }}>
          New to IMovies? <Link to={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
        </p>
      </section>
    </div>
  )
}
