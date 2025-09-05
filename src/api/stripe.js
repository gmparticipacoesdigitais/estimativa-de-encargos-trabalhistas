import { auth } from '../firebase'

export async function createCheckoutSession({ priceId } = {}) {
  const base = import.meta.env.VITE_PUBLIC_BASE_URL || ''
  const token = await auth?.currentUser?.getIdToken?.()
  const res = await fetch(`${base}/api/stripe/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ priceId })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Falha ao criar sessão (${res.status})`)
  }
  return res.json()
}

export async function startCheckout(opts = {}) {
  const { url } = await createCheckoutSession(opts)
  if (!url) throw new Error('Stripe não retornou URL de checkout')
  window.location.href = url
}
