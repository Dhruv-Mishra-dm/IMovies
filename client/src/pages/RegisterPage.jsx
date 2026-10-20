import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../hooks/useAuth.js'
import { errorMessage, fieldErrors } from '../api/client.js'
import { safeNextPath } from '../utils/navigation.js'
import { collectErrors, validateEmail, validateName, validateNewPassword } from '../utils/validation.js'
import FormField from '../components/ui/FormField.jsx'
import Button from '../components/ui/Button.jsx'
import Alert from '../components/ui/Alert.jsx'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
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
    const found = collectErrors({
      name: validateName(form.name),
      email: validateEmail(form.email),
      password: validateNewPassword(form.password),
      confirm: form.confirm === form.password ? null : 'Passwords do not match',
    })
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length) return

    setSubmitting(true)
    const result = await register({ name: form.name.trim(), email: form.email.trim(), password: form.password })
    setSubmitting(false)
    if (result.ok) {
      toast.success('Your account is ready. Enjoy the show!')
      navigate(next, { replace: true })
      return
    }
    if (result.data?.error?.code === 'EMAIL_TAKEN') {
      setErrors({ email: 'An account with this email already exists. Try logging in instead.' })
    } else {
      setErrors(fieldErrors(result))
      setServerError(errorMessage(result))
    }
  }

  return (
    <div className="container auth-page">
      <section className="card auth-card" aria-labelledby="register-heading">
        <h1 id="register-heading">Create your account</h1>
        <form onSubmit={onSubmit} noValidate>
          {serverError && <Alert type="error">{serverError}</Alert>}
          <FormField label="Full name" error={errors.name}>
            <input className="input" autoComplete="name" value={form.name} onChange={update('name')} />
          </FormField>
          <FormField label="Email" error={errors.email}>
            <input className="input" type="email" autoComplete="email" value={form.email} onChange={update('email')} />
          </FormField>
          <FormField label="Password" hint="At least 8 characters, with a letter and a number." error={errors.password}>
            <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={update('password')} />
          </FormField>
          <FormField label="Confirm password" error={errors.confirm}>
            <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} />
          </FormField>
          <Button type="submit" variant="primary" block loading={submitting}>
            Create account
          </Button>
        </form>
        <p className="muted" style={{ marginTop: 'var(--space-5)', marginBottom: 0 }}>
          Already have an account? <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link>
        </p>
      </section>
    </div>
  )
}
