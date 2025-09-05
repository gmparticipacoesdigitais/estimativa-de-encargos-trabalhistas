import { useAuth } from '../auth/AuthContext'

export default function GoogleButton({ className = '', disabled = false, onClick }) {
  const { loginWithGoogle } = useAuth()
  const handle = async () => {
    const run = onClick || (async () => { await loginWithGoogle() })
    try {
      await run()
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e.message || 'Falha no login do Google')
    }
  }
  return (
    <button
      type="button"
      aria-label="Entrar com Google"
      className={className || 'btn btn-secondary'}
      onClick={handle}
      disabled={disabled}
      style={{ width: '100%' }}
    >
      Entrar com Google
    </button>
  )
}
