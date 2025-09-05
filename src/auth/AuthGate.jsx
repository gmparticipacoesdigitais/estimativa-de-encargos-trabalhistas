import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

function SpinnerPage({ text = 'Validando acesso…' }) {
  return (
    <div className="auth-page" aria-busy="true" aria-live="polite">
      <div className="auth-container">
        <main className="auth-card" role="status" aria-label={text}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <span className="inline-flex" aria-hidden style={{ height: 24, width: 24 }}>
              <span style={{ display: 'block', height: '100%', width: '100%', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(139,92,246,.9), rgba(14,165,233,.8))' }} />
            </span>
            <div className="caption text-soft">{text}</div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function AuthGate({ children }) {
  const { user, logout } = useAuth()
  const [state, setState] = useState({ loading: true, allowed: false })

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!user) { window.location.assign('/login'); return }
      try {
        const idToken = await user.getIdToken()
        const base = import.meta.env.VITE_PUBLIC_BASE_URL || ''
        // Ensure profile + claims (tenantId) before gating
        try { await fetch(`${base}/api/session/ensure`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` } }) } catch {}
        const res = await fetch(`${base}/api/bootstrap`, { headers: { Authorization: `Bearer ${idToken}` } })
        if (!res.ok) {
          await logout().catch(() => {})
          window.location.assign('/login')
          return
        }
        const data = await res.json()
        if (cancelled) return
        if (data.subscription?.active) setState({ loading: false, allowed: true })
        else window.location.assign('/subscribe')
      } catch {
        if (cancelled) return
        await logout().catch(() => {})
        window.location.assign('/login')
      }
    }
    run()
    return () => { cancelled = true }
  }, [user])

  if (state.loading) return <SpinnerPage text="Validando acesso…" />
  return state.allowed ? children : null
}
