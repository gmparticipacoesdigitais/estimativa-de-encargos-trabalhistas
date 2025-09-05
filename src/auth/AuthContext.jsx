import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { auth, db, googleProvider } from '../firebase'
import { onAuthStateChanged, signInWithRedirect } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { loginEmailSenha, registrarEmailSenha, loginGooglePopup, logout as logoutSvc } from './service'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [claims, setClaims] = useState({ tenantId: null, roles: null })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!auth) { setLoading(false); return () => {} }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        try {
          const token = await u.getIdToken()
          const resp = await fetch('/api/session/ensure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ displayName: u.displayName || null, photoURL: u.photoURL || null }),
          })
          if (resp.ok) {
            const data = await resp.json()
            setClaims({ tenantId: data.tenantId || null, roles: data.roles || null })
          } else {
            setClaims({ tenantId: null, roles: null })
          }
        } catch {
          setClaims({ tenantId: null, roles: null })
        }
      } else {
        setClaims({ tenantId: null, roles: null })
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const saveProfile = async (uid, profile) => {
    if (!db) return
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, { ...profile, createdAt: serverTimestamp() })
    }
  }

  const register = async ({ email, password, cpfCnpj, name }) => {
    if (!auth) throw new Error('Autenticação indisponível no ambiente atual')
    const user = await registrarEmailSenha(email, password)
    await saveProfile(user.uid, { email, cpfCnpj, name })
    return user
  }

  const login = async (email, password) => {
    if (!auth) throw new Error('Autenticação indisponível no ambiente atual')
    const user = await loginEmailSenha(email, password)
    return user
  }
  const loginWithGoogle = async () => {
    if (!auth) throw new Error('Autenticação indisponível no ambiente atual')
    try {
      const u = await loginGooglePopup()
      await saveProfile(u.uid, { email: u.email, name: u.displayName || '', photoURL: u.photoURL || '' })
      try {
        const token = await u.getIdToken()
        await fetch('/api/session/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
      } catch {}
      return u
    } catch (err) {
      const code = err?.code || ''
      const popupIssues = [
        'auth/popup-blocked',
        'auth/popup-closed-by-user',
        'auth/cancelled-popup-request',
        'auth/unauthorized-domain',
      ]
      // Fallback to redirect for popup blockers / ITP / cross-site cookie issues
      if (popupIssues.includes(code)) {
        await signInWithRedirect(auth, googleProvider)
        return null
      }
      throw err
    }
  }
  const logout = () => {
    if (!auth) { setUser(null); return Promise.resolve() }
    return logoutSvc()
  }

  const value = useMemo(() => ({ user, claims, loading, register, login, loginWithGoogle, logout }), [user, claims, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
