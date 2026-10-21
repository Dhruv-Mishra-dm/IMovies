import { io } from 'socket.io-client'

let socket = null

/**
 * One shared Socket.IO connection for the whole app (created on first use).
 * Same origin as the page, so the httpOnly login cookie is sent automatically.
 */
export function getSocket() {
  socket ??= io(import.meta.env.VITE_API_URL || undefined, {
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
  })
  return socket
}
