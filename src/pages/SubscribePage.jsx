import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export default function SubscribePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const startCheckout = async () => {
    try {
      setError('')
      setLoading(true)
      const idToken = await user.getIdToken()
      const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Falha ao iniciar checkout')
      if (!json.url) throw new Error('Stripe não retornou URL de checkout')
      window.location.href = json.url
    } catch (e) {
      setError(e.message || 'Erro ao iniciar checkout')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <main className="auth-card" role="main" aria-labelledby="subscribeTitle">
          <div className="flex items-center" style={{ gap: 12, marginBottom: 12 }}>
            <span className="inline-flex" aria-hidden style={{ height: 36, width: 36 }}>
              <span style={{ display: 'block', height: '100%', width: '100%', borderRadius: 8, background: 'linear-gradient(135deg, rgba(139,92,246,.9), rgba(14,165,233,.8))' }} />
            </span>
            <h1 id="subscribeTitle" style={{ margin: 0 }}>Assinatura necessária</h1>
          </div>
          <p className="text-soft" style={{ marginTop: -8 }}>Para acessar o dashboard, ative sua assinatura mensal.</p>
          {error && <div className="caption" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
          <div className="grid" style={{ gap: 12, marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={startCheckout} disabled={loading} aria-label="Assinar agora">
              {loading ? 'Redirecionando…' : 'Assinar agora'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.assign('/')}>
              Voltar
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}

