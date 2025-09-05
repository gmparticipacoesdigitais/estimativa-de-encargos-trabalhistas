import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig'

// Minimal cross-module toast via CustomEvent; ToastStack listens for 'app:toast'
function emitToast(payload: { type?: string; text: string; timeout?: number }) {
  try {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: payload }))
  } catch {}
}

const requiredForInit = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

function getMissingKeys(): string[] {
  try {
    return requiredForInit.filter((k) => !import.meta.env[k as any]) as string[]
  } catch {
    return [...requiredForInit]
  }
}

function allCriticalPresent(cfg: typeof firebaseConfig) {
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId)
}

const missingFirebaseKeys = getMissingKeys()
const isFirebaseConfigured = allCriticalPresent(firebaseConfig)

if (!isFirebaseConfigured) {
  const hint = 'Verifique suas chaves em Firebase Console > Configurações do Projeto > seus apps > Web.'
  // eslint-disable-next-line no-console
  console.error('[Firebase] Configuração crítica ausente:', missingFirebaseKeys, '\n', hint)
  // try to toast a couple of times as UI mounts
  const notify = (delay: number) => setTimeout(() => {
    try { emitToast({ type: 'danger', text: `Firebase incompleto: ${missingFirebaseKeys.join(', ')}` }) } catch {}
  }, delay)
  try {
    notify(0); notify(500); notify(1500)
  } catch {}
}

let app
if (getApps().length) {
  app = getApp()
} else if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
} else {
  app = undefined as any
}

export const auth = app ? getAuth(app) : null as any
export const googleProvider = new GoogleAuthProvider()
try { googleProvider.setCustomParameters({ prompt: 'select_account' }) } catch {}
export const db = app ? getFirestore(app) : null as any

export { isFirebaseConfigured, missingFirebaseKeys }
export default app
