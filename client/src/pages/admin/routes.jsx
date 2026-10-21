import { lazy } from 'react'

// Admin pages are loaded on demand, so customers never download the admin code.
export const AdminLayout = lazy(() => import('./AdminLayout.jsx'))
export const AdminDashboardPage = lazy(() => import('./AdminDashboardPage.jsx'))
export const AdminMoviesPage = lazy(() => import('./AdminMoviesPage.jsx'))
export const AdminMovieFormPage = lazy(() => import('./AdminMovieFormPage.jsx'))
export const AdminTheatresPage = lazy(() => import('./AdminTheatresPage.jsx'))
export const AdminTheatreDetailPage = lazy(() => import('./AdminTheatreDetailPage.jsx'))
export const AdminScreenEditorPage = lazy(() => import('./AdminScreenEditorPage.jsx'))
export const AdminShowtimesPage = lazy(() => import('./AdminShowtimesPage.jsx'))
export const AdminShowtimeFormPage = lazy(() => import('./AdminShowtimeFormPage.jsx'))
export const AdminBookingsPage = lazy(() => import('./AdminBookingsPage.jsx').then((m) => ({ default: m.AdminBookingsPage })))
export const AdminBookingDetailPage = lazy(() => import('./AdminBookingsPage.jsx').then((m) => ({ default: m.AdminBookingDetailPage })))
