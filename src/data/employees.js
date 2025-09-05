import { db } from '../firebase'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore'

const LS_KEY = (uid) => `employees:${uid}`

export function subscribeEmployees(uid, onChange) {
  if (!uid) return () => {}
  if (!db) {
    // Fallback to localStorage only
    try {
      const raw = localStorage.getItem(LS_KEY(uid))
      const list = raw ? JSON.parse(raw) : []
      onChange(list)
    } catch { onChange([]) }
    return () => {}
  }
  const col = collection(db, 'users', uid, 'employees')
  const q = query(col, orderBy('updatedAt', 'desc'))
  const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => d.data())
    onChange(list)
    try { localStorage.setItem(LS_KEY(uid), JSON.stringify(list)) } catch {}
  }, (err) => {
    // On error, load local fallback
    try {
      const raw = localStorage.getItem(LS_KEY(uid))
      const list = raw ? JSON.parse(raw) : []
      onChange(list)
    } catch { onChange([]) }
  })
  return unsub
}

export async function upsertEmployee(uid, emp) {
  // Optimistic local cache update
  try {
    const raw = localStorage.getItem(LS_KEY(uid))
    const list = raw ? JSON.parse(raw) : []
    const idx = list.findIndex((e) => e.id === emp.id)
    const now = Date.now()
    const toSave = { ...emp, updatedAt: now, createdAt: emp.createdAt || now }
    if (idx >= 0) list[idx] = toSave; else list.unshift(toSave)
    localStorage.setItem(LS_KEY(uid), JSON.stringify(list))
  } catch {}
  if (!db) return
  const ref = doc(db, 'users', uid, 'employees', String(emp.id))
  await setDoc(ref, { ...emp, updatedAt: serverTimestamp(), createdAt: emp.createdAt || serverTimestamp() }, { merge: true })
}

export async function removeEmployee(uid, id) {
  try {
    const raw = localStorage.getItem(LS_KEY(uid))
    const list = raw ? JSON.parse(raw) : []
    const next = list.filter((e) => e.id !== id)
    localStorage.setItem(LS_KEY(uid), JSON.stringify(next))
  } catch {}
  if (!db) return
  const ref = doc(db, 'users', uid, 'employees', String(id))
  await deleteDoc(ref)
}

