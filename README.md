# Calculo de Encargos Trabalhistas — Firebase + Google Auth

[![CI](https://github.com/gmparticipacoesdigitais/estimativa-de-encargos-trabalhistas/actions/workflows/ci.yml/badge.svg)](https://github.com/gmparticipacoesdigitais/estimativa-de-encargos-trabalhistas/actions/workflows/ci.yml)

This app integrates Google Sign-In (Firebase Auth) and Firestore to manage tenants, users, employees and calculations. Backend is Express (Node) with Firebase Admin.

Key features
- Google Auth with session persistence; `/api/session/ensure` syncs profile/claims.
- Firestore structure under `/tenants/{tenantId}` with employees, calculations and audit logs.
- RBAC via custom claims: OWNER, ADMIN, ANALYST, VIEWER.
- Firestore Rules enforcing tenant isolation and immutable calculations.
- Firebase Emulator Suite for local development.

Environment
- Front (Vite): set `VITE_FIREBASE_*`, `VITE_APP_TIMEZONE`, `VITE_APP_FEATURE_EMULATORS`.
- Back (Express): set `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` (when not using emulators), `APP_TIMEZONE`, `PORT`.

Quick start
1) Copy `.env.example` to `.env` and fill in values. For local emulator use, set:
   - `VITE_APP_FEATURE_EMULATORS=1`
   - `FIREBASE_PROJECT_ID=demo-project` (or your id)
2) Install deps: `npm install`
3) Run backend+frontend: `npm run dev:full` (server + Vite)
4) Optionally run emulators: `npm run dev:emulators`

Emulators
- Config is in `firebase.json` and `firestore.rules`.
- Start: `firebase emulators:start --import=./.seed --export-on-exit` (or `npm run dev:emulators`).
- Front automatically connects when `VITE_APP_FEATURE_EMULATORS=1` and `vite` runs in dev.

API
- `POST /api/session/ensure` (Auth): Ensure profile `/tenants/{tenantId}/users/{uid}` and set custom claims.
- `GET /api/employees` (Auth, tenant): List employees.
- `POST /api/employees` (OWNER/ADMIN): Create/update with dedupe by `(nome+admissao+desligamento)`.
- `POST /api/calculations` (OWNER/ADMIN/ANALYST): Create calculation with snapshot and idempotency.

Firestore structure
- `/tenants/{tenantId}`
  - `users/{uid}`: profile + roles
  - `employees/{employeeId}`
  - `settings/current`: year tables (`aliquotas`), `regrasProrata`
  - `calculations/{calcId}`: immutable
  - `auditLogs/{logId}`

Testing
- Unit/integration via Vitest. Add tests under `server/` or `src/` as needed.

Quality/CI
- Node 20 (ver `./.nvmrc`).
- Lint: `npm run lint`
- Test: `npm test`
- Build: `npm run build`
- CI automatizado em GitHub Actions (arquivo `.github/workflows/ci.yml`).

Notes
- Do not expose service accounts in frontend.
- Dates stored in UTC; display in `America/Fortaleza`.
- Rounding in cents (half up, 2 decimals).
