import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as authApi from '../api/auth.js'
import * as bookingsApi from '../api/bookings.js'
import { renderApp, ok, fail, customer } from '../test/renderApp.jsx'

vi.mock('../api/auth.js', () => ({ getMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() }))
vi.mock('../api/bookings.js', () => ({
  getBooking: vi.fn(),
  releaseBooking: vi.fn(),
  payBooking: vi.fn(),
  cancelBooking: vi.fn(),
  listMyBookings: vi.fn(),
}))

const snapshot = {
  movie: { title: 'Alpha', certification: 'UA 13+', durationMins: 120, posterUrl: '' },
  theatre: { name: 'Galaxy Bandra' },
  screen: { name: 'Screen 1', format: 'IMAX' },
  language: 'Hindi',
  startsAt: '2099-11-02T13:00:00.000Z',
}
const booking = (overrides = {}) => ({
  id: 'b1',
  reference: 'IMV-ABCDEFGH',
  status: 'HELD',
  showtime: 's1',
  seats: [{ seatId: 'A1', category: 'CLASSIC', categoryName: 'Classic', price: 20000 }],
  totalAmount: 20000,
  holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  createdAt: '2099-11-01T10:00:00.000Z',
  snapshot,
  ...overrides,
})
const view = (b, extra = {}) => ok({ booking: b, payments: [], refunds: [], cancellation: { allowed: false, reason: 'NOT_CONFIRMED', cutoffAt: '2099-11-02T11:00:00.000Z' }, serverTime: new Date().toISOString(), ...extra })
const location = () => screen.getByTestId('location').textContent

beforeEach(() => {
  vi.clearAllMocks()
  authApi.getMe.mockResolvedValue(ok({ user: customer }))
})

describe('demo payment', () => {
  it('is clearly labelled, asks for no card details and confirms on success', async () => {
    bookingsApi.getBooking.mockResolvedValueOnce(view(booking())).mockResolvedValue(view(booking({ status: 'CONFIRMED' })))
    bookingsApi.payBooking.mockResolvedValue(ok({ payment: { id: 'p1', status: 'SUCCEEDED' }, payments: [], booking: booking({ status: 'CONFIRMED' }) }, 201))
    renderApp('/bookings/b1/checkout')
    const panel = (await screen.findByRole('heading', { name: 'Payment' })).closest('section')
    expect(within(panel).getByText('Demo payment')).toBeInTheDocument()
    expect(within(panel).queryByLabelText(/card number|cvv/i)).not.toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('button', { name: 'Pay ₹200' }))
    expect(bookingsApi.payBooking).toHaveBeenCalledWith('b1', { outcome: 'SUCCESS', idempotencyKey: expect.any(String) })
    await waitFor(() => expect(location()).toBe('/bookings/b1?confirmed=1'))
    expect(await screen.findByText('Booking confirmed')).toBeInTheDocument()
  })

  it('shows a decline, lets the customer retry with a NEW key, and lists attempts', async () => {
    bookingsApi.getBooking.mockResolvedValue(view(booking()))
    bookingsApi.payBooking
      .mockResolvedValueOnce(
        ok({ payment: { id: 'p1', status: 'FAILED', failureMessage: 'The demo payment was declined. You can try again.' }, payments: [{ id: 'p1', status: 'FAILED', failureCode: 'CARD_DECLINED', createdAt: new Date().toISOString() }], booking: booking() }, 201),
      )
      .mockResolvedValueOnce(ok({ payment: { id: 'p2', status: 'SUCCEEDED' }, payments: [], booking: booking({ status: 'CONFIRMED' }) }, 201))
    renderApp('/bookings/b1/checkout')
    await userEvent.click(await screen.findByLabelText(/Decline: card declined/))
    await userEvent.click(screen.getByRole('button', { name: 'Pay ₹200' }))
    expect(await screen.findByText('The demo payment was declined. You can try again.')).toBeInTheDocument()
    expect(screen.getByText('card declined')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(/Approve the payment/))
    await userEvent.click(screen.getByRole('button', { name: 'Pay ₹200' }))
    const [first, second] = bookingsApi.payBooking.mock.calls.map((c) => c[1].idempotencyKey)
    expect(first).not.toBe(second)
  })

  it('reuses the SAME key after a network failure so a retry can never pay twice', async () => {
    bookingsApi.getBooking.mockResolvedValue(view(booking()))
    bookingsApi.payBooking.mockResolvedValueOnce({ ok: false, status: 0, kind: 'unreachable', data: null }).mockResolvedValueOnce(ok({ payment: { id: 'p1', status: 'SUCCEEDED' }, payments: [], booking: booking({ status: 'CONFIRMED' }) }, 200))
    renderApp('/bookings/b1/checkout')
    await userEvent.click(await screen.findByRole('button', { name: 'Pay ₹200' }))
    expect(await screen.findByText(/Pressing Pay again is safe/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pay ₹200' }))
    const [first, second] = bookingsApi.payBooking.mock.calls.map((c) => c[1].idempotencyKey)
    expect(first).toBe(second)
  })

  it('switches to the expired state when the server says the hold ended', async () => {
    bookingsApi.getBooking.mockResolvedValueOnce(view(booking())).mockResolvedValue(view(booking({ status: 'EXPIRED' })))
    bookingsApi.payBooking.mockResolvedValue(fail(409, 'HOLD_EXPIRED', 'expired'))
    renderApp('/bookings/b1/checkout')
    await userEvent.click(await screen.findByRole('button', { name: 'Pay ₹200' }))
    expect(await screen.findByRole('heading', { name: 'Your seat hold has expired' })).toBeInTheDocument()
  })
})

describe('booking detail and cancellation', () => {
  const confirmed = booking({ status: 'CONFIRMED' })
  const paidView = (b, cancellation) =>
    view(b, { payments: [{ id: 'p1', status: b.status === 'CANCELLED' ? 'REFUNDED' : 'SUCCEEDED', amount: 20000, succeededAt: '2099-11-01T10:01:00.000Z' }], cancellation })

  it('cancels an eligible booking after confirmation and shows the refund', async () => {
    bookingsApi.getBooking
      .mockResolvedValueOnce(paidView(confirmed, { allowed: true, cutoffAt: '2099-11-02T11:00:00.000Z' }))
      .mockResolvedValue({ ...paidView(booking({ status: 'CANCELLED', cancellation: { reason: 'CUSTOMER_REQUEST' } }), { allowed: false }), data: { ...paidView(booking({ status: 'CANCELLED', cancellation: { reason: 'CUSTOMER_REQUEST' } }), { allowed: false }).data, refunds: [{ id: 'r1', status: 'SUCCEEDED', amount: 20000 }] } })
    bookingsApi.cancelBooking.mockResolvedValue(ok({}))
    renderApp('/bookings/b1')
    expect(await screen.findByText('IMV-ABCDEFGH')).toBeInTheDocument()
    expect(screen.getByText(/full refund of ₹200/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }))
    expect(bookingsApi.cancelBooking).not.toHaveBeenCalled() // needs confirmation
    const dialog = screen.getByRole('heading', { name: 'Cancel this booking?' }).closest('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }))
    expect(bookingsApi.cancelBooking).toHaveBeenCalledWith('b1')
    expect(await screen.findByText('You cancelled this booking.')).toBeInTheDocument()
    expect(screen.getAllByText('Refunded').length).toBeGreaterThan(0)
  })

  it('explains why a booking can no longer be cancelled', async () => {
    bookingsApi.getBooking.mockResolvedValue(paidView(confirmed, { allowed: false, reason: 'CUTOFF_PASSED', cutoffAt: '2099-11-02T11:00:00.000Z' }))
    renderApp('/bookings/b1')
    expect(await screen.findByText(/can no longer be cancelled/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
  })
})

describe('my bookings', () => {
  it('lists upcoming bookings and switches to past & cancelled', async () => {
    bookingsApi.listMyBookings.mockImplementation(async ({ scope }) =>
      ok({ items: scope === 'upcoming' ? [booking({ status: 'CONFIRMED' })] : [booking({ id: 'b2', status: 'CANCELLED', reference: 'IMV-ZZZZZZZZ' })], page: 1, totalPages: 1 }),
    )
    renderApp('/bookings')
    expect(await screen.findByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/bookings/b1')
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Past & cancelled' }))
    expect(await screen.findByText('IMV-ZZZZZZZZ')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(bookingsApi.listMyBookings).toHaveBeenLastCalledWith({ scope: 'past', page: 1 }, expect.anything())
  })

  it('shows an empty state', async () => {
    bookingsApi.listMyBookings.mockResolvedValue(ok({ items: [], page: 1, totalPages: 1 }))
    renderApp('/bookings')
    expect(await screen.findByRole('heading', { name: 'No upcoming bookings' })).toBeInTheDocument()
  })
})
