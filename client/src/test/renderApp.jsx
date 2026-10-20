import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import AuthProvider from '../context/AuthProvider.jsx'
import { AppRoutes } from '../App.jsx'

/** Shows the current URL so tests can assert on navigation. */
export function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

/** Renders the real routes at `path` (api modules should be mocked by the test). */
export function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
        <ToastContainer />
      </AuthProvider>
    </MemoryRouter>,
  )
}

export const customer = { id: 'u1', name: 'Asha Rao', email: 'asha@example.test', role: 'customer', createdAt: '2026-10-01T00:00:00Z' }
export const admin = { ...customer, id: 'a1', name: 'Admin User', role: 'admin' }
export const ok = (data, status = 200) => ({ ok: true, status, data, kind: 'ok' })
export const fail = (status, code, message = 'Request failed', details) => ({
  ok: false,
  status,
  kind: 'http-error',
  data: { error: { code, message, ...(details && { details }) } },
})
