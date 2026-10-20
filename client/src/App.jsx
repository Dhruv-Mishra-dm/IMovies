import { Route, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import AuthProvider from './context/AuthProvider.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import { GuestOnly, RequireAuth } from './components/routing/RouteGuards.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import { NotFoundPage, StatusPage } from './pages/SimplePages.jsx'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="status" element={<StatusPage />} />
        <Route element={<GuestOnly />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <ToastContainer position="bottom-right" theme="dark" newestOnTop limit={3} />
    </AuthProvider>
  )
}
