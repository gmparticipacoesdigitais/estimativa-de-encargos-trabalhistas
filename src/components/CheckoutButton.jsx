import { startCheckout } from '../api/stripe'

export default function CheckoutButton({ priceId, label = 'Assinar', className = '', mode = 'subscription', successPath = '/checkout/success', cancelPath = '/checkout/cancel', ariaLabel }) {
  const onClick = async () => {
    try {
      await startCheckout({ priceId, mode, successPath, cancelPath })
    } catch (err) {
      alert(err.message || 'Falha ao iniciar checkout')
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn btn-primary ${className}`.trim()}
      aria-label={ariaLabel || 'Assinar plano'}
      title="Iniciar checkout com Stripe"
    >
      {label}
    </button>
  )
}
