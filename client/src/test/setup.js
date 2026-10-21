// Runs before every frontend test file.
import '@testing-library/jest-dom/vitest' // adds matchers like toBeInTheDocument()
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { fakeSocket } from './fakeSocket.js'

// No test opens a real Socket.IO connection; tests drive this fake instead (see fakeSocket.js).
vi.mock('../api/socket.js', () => ({ getSocket: () => fakeSocket }))

// Unmount rendered components between tests so they don't leak into each other.
afterEach(() => {
  cleanup()
  fakeSocket.reset()
})
