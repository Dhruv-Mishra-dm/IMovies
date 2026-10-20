import { createContext } from 'react'

/**
 * { status: 'loading' | 'authenticated' | 'anonymous', user, login, register, logout, logoutAll, setUser }
 * Provided by <AuthProvider>; read it with useAuth().
 */
export const AuthContext = createContext(null)
