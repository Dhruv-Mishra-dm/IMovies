import { startTransition, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'

/**
 * Returns signOut(to = '/'): navigates away and forgets the user in the SAME React transition.
 * React Router runs navigations as transitions; if the user were cleared as a normal (urgent)
 * update, a protected page would re-render first and redirect to /login.
 */
export function useSignOut() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  return useCallback(
    (to = '/') => {
      startTransition(() => {
        navigate(to, { replace: true })
        setUser(null)
      })
    },
    [navigate, setUser],
  )
}
