// Runs before every frontend test file.
import '@testing-library/jest-dom/vitest' // adds matchers like toBeInTheDocument()
import { afterEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import { fakeSocket } from './fakeSocket.js'

// findBy*/waitFor give up after 1 s by default. With all test files running in parallel on a slower
// machine, a page can take longer than that to render, so allow more time (assertions are unchanged).
configure({ asyncUtilTimeout: 5000 })

// No test opens a real Socket.IO connection; tests drive this fake instead (see fakeSocket.js).
vi.mock('../api/socket.js', () => ({ getSocket: () => fakeSocket }))

// Unmount rendered components between tests so they don't leak into each other.
afterEach(() => {
  cleanup()
  fakeSocket.reset()
})
