// Runs before every frontend test file.
import '@testing-library/jest-dom/vitest' // adds matchers like toBeInTheDocument()
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount rendered components between tests so they don't leak into each other.
afterEach(() => cleanup())
