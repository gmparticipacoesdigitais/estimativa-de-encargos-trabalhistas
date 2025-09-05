import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Stripe from 'stripe'
import pino from 'pino'
import net from 'node:net'
import { initFirebaseAdmin } from './firebaseAdmin.js'
import { errorHandler, verifyIdToken } from './middleware/auth.js'
import { sessionRouter } from './routes/session.js'
import { employeesRouter } from './routes/employees.js'
import { calculationsRouter } from './routes/calculations.js'
import { adminRouter } from './routes/admin.js'
import { createBillingRouter } from './routes/billing.js'

const app = express()
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

// Desired port (used for initial fallback and messaging)
const DESIRED_PORT = process.env.PORT ? Number(process.env.PORT) : 8080
let PUBLIC_BASE_URL = process.env.VITE_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${DESIRED_PORT}`
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

// CORS: allow configured origins and credentials
const ALLOW_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
if (ALLOW_ORIGINS.length > 0) {
  app.use(cors({ origin: (origin, cb) => {
    // Allow same-origin or listed origins
    if (!origin) return cb(null, true)
    if (ALLOW_ORIGINS.includes(origin)) return cb(null, true)
    return cb(new Error('CORS not allowed'), false)
  }, credentials: true }))
} else {
  // Default permissive in dev, but reflect origin (not *) to support credentials when needed
  app.use(cors({ origin: true, credentials: true }))
}
// JSON for regular routes
app.use('/api', express.json())

// Initialize Firebase Admin ASAP
try {
  initFirebaseAdmin()
  logger.info('Firebase Admin initialized')
} catch (e) {
  logger.error({ err: e }, 'Failed to init Firebase Admin')
}

let stripe = null
if (STRIPE_SECRET_KEY) {
  stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
} else {
  // eslint-disable-next-line no-console
  console.warn('STRIPE_SECRET_KEY not set. Stripe routes will return 503.')
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, stripe: Boolean(stripe) })
})

// Create Checkout Session
app.post('/api/checkout/session', async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' })
    const { priceId, quantity = 1, mode = 'payment', successPath = '/', cancelPath = '/' } = req.body || {}
    let price = priceId || process.env.STRIPE_PRICE_ID || null
    if (!price) {
      const productId = process.env.STRIPE_PRODUCT_ID
      if (!productId) {
        return res.status(400).json({ error: 'Missing priceId or STRIPE_PRICE_ID/STRIPE_PRODUCT_ID' })
      }
      const product = await stripe.products.retrieve(productId)
      const defaultPrice = product.default_price
      if (!defaultPrice) return res.status(400).json({ error: 'Product has no default price' })
      price = typeof defaultPrice === 'string' ? defaultPrice : defaultPrice.id
    }

    const origin = req.headers.origin || PUBLIC_BASE_URL
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price, quantity }],
      success_url: `${origin}${successPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}?checkout=canceled`,
      allow_promotion_codes: true,
      // payment_intent_data: {},
    })
    res.json({ id: session.id, url: session.url })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Stripe session error', err)
    res.status(500).json({ error: err.message || 'Internal error' })
  }
})

// Retrieve Checkout Session details (for client success page)
app.get('/api/checkout/session/:id', async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' })
    const { id } = req.params
    const session = await stripe.checkout.sessions.retrieve(id, { expand: ['subscription', 'payment_intent'] })
    res.json({ id: session.id, status: session.status, customer_email: session.customer_details?.email || null, mode: session.mode, subscription: session.subscription || null })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to retrieve session' })
  }
})

// Legacy webhook path (kept for compatibility)
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe not configured')
  const sig = req.headers['stripe-signature']
  let event
  try { event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET) }
  catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`) }
  res.json({ received: true, type: event.type })
})

// Primary Stripe webhook per spec
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe not configured')
  const sig = req.headers['stripe-signature']
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    const type = event.type
    if (type.startsWith('customer.subscription.')) {
      const sub = event.data.object
      const customerId = sub.customer
      const status = sub.status
      // Update Firestore mapping
      const { getDb } = await import('./firebaseAdmin.js')
      const db = getDb()
      const mapRef = db.collection('stripeCustomers').doc(String(customerId))
      const mapSnap = await mapRef.get()
      if (mapSnap.exists) {
        const { uid, tenantId } = mapSnap.data()
        await db.collection('tenants').doc(String(tenantId)).collection('users').doc(String(uid)).set({ stripeCustomerId: customerId, subscriptionStatus: status }, { merge: true })
      }
    } else if (type === 'checkout.session.completed') {
      // No-op; subscription events will follow
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Webhook handling failed', err)
  }
  res.json({ received: true })
})

// Firebase-backed APIs
app.use('/api/session', sessionRouter)
app.use('/api/employees', employeesRouter)
app.use('/api/calculations', calculationsRouter)
app.use('/api/admin', adminRouter)
// Stripe-gated routes
if (stripe) {
  app.use('/api', createBillingRouter({ stripe, appUrl: PUBLIC_BASE_URL }))
}
// Provide a fallback /api/bootstrap when Stripe is not configured
if (!stripe) {
  app.get('/api/bootstrap', verifyIdToken, async (req, res) => {
    try {
      const { uid, email } = req.auth || {}
      return res.json({ auth: { uid, email }, subscription: { active: false, status: 'none' } })
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Bootstrap failed' })
    }
  })
}

// Error handler
app.use(errorHandler)

let serverInstance = null
if (process.env.NODE_ENV !== 'test') {
  // Port selection helpers (ESM + top-level await)
  function isPortFree(port, host = '0.0.0.0') {
    return new Promise((resolve) => {
      const srv = net
        .createServer()
        .once('error', (err) => {
          // Consider occupied if EADDRINUSE or EACCES
          if (err.code === 'EADDRINUSE' || err.code === 'EACCES') resolve(false)
          else resolve(false)
        })
        .once('listening', () => {
          srv.close(() => resolve(true))
        })
      srv.listen({ port, host })
    })
  }

  async function pickPort(desired = 8080) {
    const candidates = [
      Number(process.env.PORT) || desired,
      3000,
      3001,
      5000,
      5173,
      0, // let the OS choose
    ]

    for (const p of candidates) {
      if (p === 0 || (await isPortFree(p))) return p
    }
    return 0
  }

  const port = await pickPort(DESIRED_PORT)

  serverInstance = app.listen(port, () => {
    const actual = serverInstance.address().port

    // Update PUBLIC_BASE_URL fallback with the actual chosen port
    if (!process.env.VITE_PUBLIC_BASE_URL && !process.env.PUBLIC_BASE_URL) {
      PUBLIC_BASE_URL = `http://localhost:${actual}`
    }

    if (actual !== (Number(process.env.PORT) || DESIRED_PORT)) {
      // eslint-disable-next-line no-console
      console.log(`[server] Porta desejada ocupada. Servidor subiu automaticamente em ${actual}.`)
    } else {
      // eslint-disable-next-line no-console
      console.log(`[server] Servidor ouvindo em ${actual}.`)
    }
    // eslint-disable-next-line no-console
    console.log(`API listening on ${actual}. Public URL: ${PUBLIC_BASE_URL}`)
  })

  // Optional: handle other unexpected listen errors
  serverInstance.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[server] Erro ao iniciar:', err)
    process.exitCode = 1
  })
}

export const server = serverInstance
export default app
