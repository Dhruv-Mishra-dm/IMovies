import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import * as authApi from '../api/auth.js'
import { SESSION_EXPIRED_EVENT } from '../api/client.js'
import { getSocket } from '../api/socket.js'
import { AuthContext } from './authContext.js'

/**
 * Holds who is logged in. The session itself lives in httpOnly cookies that JavaScript can't read,
 * so on start-up we simply ask the server (/api/auth/me). The user object is only used to decide
 * what to SHOW; every permission is enforced again by the server.
 */
export default function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null })

  const setUser = useCallback((user) => {
    setState(user ? { status: 'authenticated', user } : { status: 'anonymous', user: null })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    authApi.getMe(controller.signal).then(
      (result) => setUser(result.ok ? result.data.user : null),
      () => {},
    )
    return () => controller.abort()
  }, [setUser])

  // The real-time socket identifies the user once, when it connects. When the logged-in user changes
  // (login, logout, session expiry), reconnect it so the server sees the new identity: personal events
  // then reach the right person, and a logged-out browser leaves the previous user's private room.
  const userId = state.user?.id ?? null
  const previousUserId = useRef(undefined)
  useEffect(() => {
    if (state.status === 'loading') return
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      const socket = getSocket()
      if (socket.connected) {
        socket.disconnect()
        socket.connect()
      }
    }
    previousUserId.current = userId
  }, [userId, state.status])

  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      toast.info('Your session has expired. Please log in again.', { toastId: 'session-expired' })
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [setUser])

  const login = useCallback(
    async (credentials) => {
      const result = await authApi.login(credentials)
      if (result.ok) setUser(result.data.user)
      return result
    },
    [setUser],
  )

  const register = useCallback(
    async (details) => {
      const result = await authApi.register(details)
      if (result.ok) setUser(result.data.user)
      return result
    },
    [setUser],
  )

  // logout/logoutAll only call the server. The caller then uses useSignOut() to navigate away and
  // forget the user in ONE transition; clearing the user first would let a protected page's guard
  // redirect to /login before the navigation happens.
  const logout = useCallback(() => authApi.logout(), [])
  const logoutAll = useCallback(() => authApi.logoutAll(), [])

  const value = useMemo(
    () => ({ ...state, login, register, logout, logoutAll, setUser }),
    [state, login, register, logout, logoutAll, setUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
