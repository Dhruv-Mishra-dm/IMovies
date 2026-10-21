import { Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import AuthProvider from './context/AuthProvider.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import { GuestOnly, RequireAuth, RequireAdmin } from './components/routing/RouteGuards.jsx'
import { PageLoader } from './components/ui/Feedback.jsx'
import * as Admin from './pages/admin/routes.jsx'
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
        <Route element={<RequireAdmin />}>
          <Route
            path="admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <Admin.AdminLayout />
              </Suspense>
            }
          >
            <Route index element={<Admin.AdminDashboardPage />} />
            <Route path="movies" element={<Admin.AdminMoviesPage />} />
            <Route path="movies/new" element={<Admin.AdminMovieFormPage />} />
            <Route path="movies/:id" element={<Admin.AdminMovieFormPage />} />
            <Route path="theatres" element={<Admin.AdminTheatresPage />} />
            <Route path="theatres/:id" element={<Admin.AdminTheatreDetailPage />} />
            <Route path="theatres/:theatreId/screens/new" element={<Admin.AdminScreenEditorPage />} />
            <Route path="screens/:id" element={<Admin.AdminScreenEditorPage />} />
            <Route path="showtimes" element={<Admin.AdminShowtimesPage />} />
            <Route path="showtimes/new" element={<Admin.AdminShowtimeFormPage />} />
            <Route path="bookings" element={<Admin.AdminBookingsPage />} />
            <Route path="bookings/:id" element={<Admin.AdminBookingDetailPage />} />
          </Route>
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
