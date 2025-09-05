import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import GoogleButton from '../components/GoogleButton'
import { isFirebaseConfigured, missingFirebaseKeys } from '../firebase'
import { useNavigate } from 'react-router-dom'
import { onlyDigits, isValidCPF, isValidCNPJ, labelCpfCnpj, formatCpfCnpj } from '../utils/br'
import Card from '../components/Card'
import Input from '../components/Input'
import Button from '../components/Button'
import { auth } from '../firebase'
import { getRedirectResult } from 'firebase/auth'
import ToastStack from '../components/Toast.jsx'

export default function AuthPage() {
  const { login, register, loginWithGoogle, user } = useAuth()
  const navigate = useNavigate()
  
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [form, setForm] = useState({ email: '', password: '', cpfCnpj: '', name: '' })
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastAction, setLastAction] = useState(null) // 'email-login' | 'email-register' | 'google'
  const errRef = useRef(null)

  useEffect(() => {
    if (error && errRef && errRef.current) {
      try { errRef.current.focus() } catch {}
    }
  }, [error])

  const onChange = (e) => {
    const { name, value } = e.target
    if (name === 'cpfCnpj') {
      return setForm((f) => ({ ...f, [name]: formatCpfCnpj(value) }))
    }
    setForm((f) => ({ ...f, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setErrorCode('')
    setLoading(true)
    try {
      if (mode === 'login') {
        setLastAction('email-login')
        await login(form.email, form.password)
        navigate('/dashboard')
      } else {
        const digits = onlyDigits(form.cpfCnpj)
        const isCpf = digits.length === 11
        const isCnpj = digits.length === 14
        if (!isCpf && !isCnpj) throw new Error('Informe um CPF (11) ou CNPJ (14)')
        if (isCpf && !isValidCPF(digits)) throw new Error('CPF inválido')
        if (isCnpj && !isValidCNPJ(digits)) throw new Error('CNPJ inválido')
        if (!form.name.trim()) throw new Error('Informe seu nome')
        setLastAction('email-register')
        await register({ email: form.email, password: form.password, cpfCnpj: digits, name: form.name.trim() })
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.message || 'Falha na autenticação')
      setErrorCode(err.code || '')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setErrorCode('')
    setLoading(true)
    try {
      setLastAction('google')
      await loginWithGoogle()
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Falha no Google')
      setErrorCode(err.code || '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) navigate('/')
  }, [user, navigate])

  // Handle redirect-based Google sign-in return
  useEffect(() => {
    let cancelled = false
    const finalize = async () => {
      if (!auth) return
      try {
        const res = await getRedirectResult(auth)
        if (!res || !res.user) return
        if (cancelled) return
        // session ensure is handled in AuthContext listener too; navigate to home
        navigate('/')
      } catch (e) {
        if (cancelled) return
        const code = e?.code || ''
        // Friendly error hints
        if (code.includes('redirect') || code.includes('domain') || code.includes('unauthorized')) {
          setError('Falha no redirecionamento do Google — verifique domínios/URIs autorizados no Firebase Auth.')
        } else if (code.includes('popup')) {
          setError('Popup bloqueado. Tentando via redirecionamento…')
        } else if (e?.message?.includes('idpiframe_initialization_failed')) {
          setError('Falha na inicialização do Google (idpiframe). Verifique os domínios autorizados.')
        }
      }
    }
    finalize()
    return () => { cancelled = true }
  }, [navigate])

  const retestar = async () => {
    if (lastAction === 'google') return handleGoogle()
    return handleSubmit({ preventDefault: () => {} })
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
      <main className="auth-card" role="main" aria-labelledby="authTitle">
        <div className="flex items-center" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="caption text-soft">Faça login para acessar</div>
        </div>

        {!isFirebaseConfigured && (
          <div className="card" style={{ background: 'var(--accent-50)', marginBottom: 12 }}>
            <div className="caption" style={{ color: 'var(--color-ink)' }}>
              Configuração do Firebase ausente. Defina as variáveis necessárias em `.env`:
            </div>
            <div className="font-mono caption" style={{ color: 'var(--color-ink-soft)' }}>
              {missingFirebaseKeys.join(', ')}
            </div>
          </div>
        )}

        <div className="flex items-center" style={{ gap: 12, marginBottom: 12 }}>
          <span className="inline-flex" aria-hidden style={{ height: 36, width: 36 }}>
            <span style={{ display: 'block', height: '100%', width: '100%', borderRadius: 8, background: 'linear-gradient(135deg, rgba(139,92,246,.9), rgba(14,165,233,.8))' }} />
          </span>
          <h1 id="authTitle" style={{ margin: 0 }}>Acessar a Calculadora</h1>
        </div>

        <p className="text-soft" style={{ marginTop: -8 }}>Faça login para continuar e manter seus cálculos salvos.</p>

        <div className="grid" style={{ gap: 12, marginTop: 12 }}>
          <div className="flex" style={{ gap: 8 }}>
            <Button variant={mode==='login'?'primary':'secondary'} onClick={() => setMode('login')}>Entrar</Button>
            <Button variant={mode==='signup'?'primary':'secondary'} onClick={() => setMode('signup')}>Criar conta</Button>
          </div>
          <form onSubmit={handleSubmit} className="grid" style={{ gap: 12 }}>
            {mode === 'signup' && (
              <>
                <Input label="Nome" name="name" value={form.name} onChange={onChange} placeholder="Seu nome" required />
                <Input label={labelCpfCnpj(form.cpfCnpj)} name="cpfCnpj" value={form.cpfCnpj} onChange={onChange} inputMode="numeric" placeholder="CPF ou CNPJ" required hint="Apenas números" />
              </>
            )}
            <Input label="E-mail" type="email" name="email" value={form.email} onChange={onChange} placeholder="voce@exemplo.com" required autoComplete="email" />
            <Input label="Senha" type="password" name="password" value={form.password} onChange={onChange} placeholder="••••••••" required autoComplete="current-password" />
            {error && (
              <div
                ref={errRef}
                className="caption"
                style={{ color: 'var(--danger)' }}
                role="alert"
                aria-live="assertive"
                tabIndex={-1}
              >
                {error}
              </div>
            )}
            {errorCode === 'auth/operation-not-allowed' && (
              <Card className="card" style={{ background: 'var(--accent-50)' }}>
                <div className="caption" style={{ color: 'var(--color-ink)' }}>
                  Passos para corrigir no Firebase Console:
                </div>
                <ol className="caption" style={{ color: 'var(--color-ink-soft)' }}>
                  <li>a) Habilitar Email/Senha e Google em Authentication &gt; Método de login</li>
                  <li>b) Adicionar 'localhost' em Domínios autorizados</li>
                  <li>c) Reiniciar o servidor de desenvolvimento</li>
                </ol>
                <div className="flex" style={{ justifyContent: 'flex-end' }}>
                  <Button onClick={retestar}>Re-testar login</Button>
                </div>
              </Card>
            )}
            <Button type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Autenticando…' : (mode==='login' ? 'Entrar' : 'Criar conta')}
            </Button>
          </form>
          <div className="caption text-soft" style={{ textAlign: 'center' }}>ou</div>
          <GoogleButton className="btn btn-google" disabled={loading} onClick={handleGoogle} />
          <p className="caption text-soft">Ao continuar, você concorda com nossos termos e política de privacidade.</p>
        </div>
      </main>
      </div>
      <ToastStack />
    </div>
  )
}
