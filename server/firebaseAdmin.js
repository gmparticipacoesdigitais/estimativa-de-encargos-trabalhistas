import admin from 'firebase-admin'

let app
let initialized = false

export function initFirebaseAdmin() {
  if (initialized) return admin

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT

  // Prefer application default credentials or service account via GOOGLE_APPLICATION_CREDENTIALS
  // For emulator support, only projectId is required.
  try {
    if (!admin.apps.length) {
      const options = {}
      if (projectId) options.projectId = projectId
      admin.initializeApp(options)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize Firebase Admin:', e)
    throw e
  }
  app = admin
  initialized = true
  return admin
}

export function getAdmin() {
  if (!initialized) return initFirebaseAdmin()
  return app
}

export function getDb() {
  return getAdmin().firestore()
}

export function getAuthAdmin() {
  return getAdmin().auth()
}

