export async function createCheckoutSession({ priceId, quantity = 1, mode = 'payment', successPath = '/', cancelPath = '/' } = {}) {
  const base = import.meta.env.VITE_PUBLIC_BASE_URL || ''
  const res = await fetch(`${base}/api/checkout/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId, quantity, mode, successPath, cancelPath })
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

