# Production Readiness Checklist

Audit date: 2026-02-25
Project: `music-player`

## 1) Build and code quality

- [x] `npm run lint` passes.
- [x] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes in production-like environment.
  - Current status: compile succeeds; this sandbox still fails at final step with OS-level `spawn EPERM`.
  - Action: verify full build on CI/host (outside sandbox restrictions).

## 2) Environment and secrets

- [x] `.env.example` exists and documents required env vars.
- [x] `.env*` is ignored by git.
- [x] Runtime env validation rejects placeholder/short `NEXTAUTH_SECRET` in production.
  - Implemented in `src/lib/env.ts`; triggered at server boot via `instrumentation.ts`.
  - Production deploy fails fast on weak secrets, missing vars, or non-HTTPS `NEXTAUTH_URL`.
- [ ] `NEXTAUTH_SECRET` is rotated to strong production secret (not placeholder).
  - Generate: `openssl rand -base64 48`.
  - Vercel: Project → Settings → Environment Variables → set `NEXTAUTH_SECRET` for the `Production` environment only → Save → redeploy.
  - Verify rotation: existing sessions are invalidated (users will be signed out — expected).
  - Rotate at least every 90 days, or immediately on suspected compromise.
- [ ] `YOUTUBE_API_KEY` is restricted (HTTP referrer + quota alerts configured).
  - Google Cloud Console → APIs & Services → Credentials → select the key.
  - Application restrictions → "HTTP referrers" → add `https://<your-prod-domain>/*` (and any preview domains).
  - API restrictions → "Restrict key" → allow only "YouTube Data API v3".
  - Quotas: APIs & Services → Quotas → set an alert at 80% of daily quota (default 10k units/day).
  - Keep the unrestricted dev key in a separate Google Cloud project.
- [ ] Separate env values prepared for production (no dev defaults).
  - `.env.example` includes generation instructions for `NEXTAUTH_SECRET` and production guidance for `NEXTAUTH_URL`.
  - CI uses an obviously non-production placeholder (`ci-placeholder-do-not-use-in-prod-…`) which the production validator would refuse.

## 3) Authentication and authorization

- [x] Playlist endpoints require authenticated session and user ownership checks.
- [x] App routes under `(app)` are session-protected via server layout redirect.
- [x] Public API exposure reviewed (`/api/youtube/search`, `/api/tracks`) and hardened.
  - `/api/youtube/search` and `/api/tracks` now require authenticated sessions.

## 4) API hardening

- [x] Input validation with `zod` exists on playlist write endpoints.
- [x] Add validation for YouTube search query params (`q`, pagination token limits, max length).
- [x] Add rate limiting for `/api/youtube/search` (write endpoints still pending).
- [ ] Standardize API error format + request id for tracing.
- [x] Security headers configured (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
  - Configured in `next.config.ts` `headers()` for all routes.

## 5) Database readiness

- [x] Prisma schema includes core constraints (e.g. `@@unique([playlistId, trackId])`).
- [x] Migration flow is production-safe (`prisma migrate deploy`).
  - Added migration scripts in `package.json` and baseline files under `prisma/migrations`.
- [ ] Production DB engine decided (SQLite is currently configured; validate suitability).
- [ ] Backup and restore procedure documented and tested.

## 6) Observability and monitoring

- [ ] Error tracking integrated (Sentry or equivalent).
- [ ] Structured logs for API errors and latency.
- [ ] Basic health endpoint and uptime checks configured.

## 7) Testing

- [ ] Unit tests for quiz logic (snippet picking, next/previous flow, finish logic).
- [ ] Integration tests for playlist APIs (create/update/delete/reorder/add/remove track).
- [ ] E2E smoke test (sign in -> search -> save track -> play -> quiz/companion).

## 8) CI/CD and release process

- [x] CI workflow exists for lint + typecheck + build (+ tests when available).
  - Added GitHub Actions workflow at `.github/workflows/ci.yml`.
- [ ] Staging environment tested before production release.
- [ ] Rollback plan documented (app version + DB migration strategy).

## 9) UX and accessibility minimum

- [ ] Accessibility pass for keyboard navigation and focus visibility on primary flows.
- [ ] Consistent loading/error/empty states across Home, Library, Quiz, Companion.
- [ ] Destructive actions protected with confirmation and clear feedback.

## Final Go/No-Go

- [ ] Go Live approved only after all critical unchecked items are completed:
  - build success
  - secret hardening
  - migration strategy
  - rate limiting
  - CI pipeline
