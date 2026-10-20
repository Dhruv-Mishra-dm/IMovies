import { Route, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import AuthProvider from './context/AuthProvider.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import { GuestOnly, RequireAuth } from './components/routing/RouteGuards.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import MoviesPage from './pages/MoviesPage.jsx'
import MovieDetailPage from './pages/MovieDetailPage.jsx'
import TheatresPage from './pages/TheatresPage.jsx'
import TheatreDetailPage from './pages/TheatreDetailPage.jsx'
import ShowtimePage from './pages/ShowtimePage.jsx'
import CheckoutPage from './pages/CheckoutPage.jsx'
import BookingDetailPage from './pages/BookingDetailPage.jsx'
import MyBookingsPage from './pages/MyBookingsPage.jsx'
import { NotFoundPage, StatusPage } from './pages/SimplePages.jsx'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="status" element={<StatusPage />} />
        <Route path="movies" element={<MoviesPage />} />
        <Route path="movies/:slug" element={<MovieDetailPage />} />
        <Route path="theatres" element={<TheatresPage />} />
        <Route path="theatres/:slug" element={<TheatreDetailPage />} />
        <Route path="showtimes/:id" element={<ShowtimePage />} />
        <Route element={<GuestOnly />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
          <Route path="bookings/:id/checkout" element={<CheckoutPage />} />
          <Route path="bookings/:id" element={<BookingDetailPage />} />
          <Route path="bookings" element={<MyBookingsPage />} />
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
