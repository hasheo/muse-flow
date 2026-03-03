# Security Hardening Design

Date: 2026-03-03
Status: Approved

## Goal

Harden MuseFlow's security posture for Vercel deployment by adding security headers, improving secret management, and updating the deploy checklist.

## Context

- YouTube API key is already server-side only (in `/api/youtube/search/route.ts`) — no client exposure.
- No security headers are configured (no CSP, HSTS, X-Frame-Options, etc.).
- `NEXTAUTH_SECRET` placeholder in `.env.example` is weak (`"change-me-in-production"`).
- Deploy checklist has several unchecked security items.
- Deployment target: Vercel.

## Design

### 1. Security Headers in `next.config.ts`

Add an `async headers()` function returning security headers for all routes.

Headers:

| Header | Value |
|--------|-------|
| X-Frame-Options | SAMEORIGIN |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |
| Content-Security-Policy | See below |

CSP directives (tuned for YouTube IFrame API + Tailwind + Next.js):

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com;
frame-src https://www.youtube.com;
img-src 'self' https://i.ytimg.com https://images.unsplash.com data:;
style-src 'self' 'unsafe-inline';
connect-src 'self' https://www.googleapis.com;
font-src 'self';
```

### 2. Secret Hardening

- Update `.env.example` with `openssl rand -base64 32` instruction for `NEXTAUTH_SECRET`.
- Add `NEXTAUTH_URL` to `.env.example` with production guidance.

### 3. Deploy Checklist Updates

Mark completed security items and add notes reflecting current state.

## Decisions

- **Headers in `next.config.ts`** (not middleware) — simpler, idiomatic for Vercel, keeps middleware clean for auth only.
- **`unsafe-inline` + `unsafe-eval` in script-src** — required by YouTube IFrame API and Next.js dev mode. Can be tightened with nonces in a future pass.
- **YouTube API key is already safe** — no proxy endpoint needed; key lives only in server-side route handler.

## Files to Modify

1. `next.config.ts` — add `headers()` function
2. `.env.example` — improve secret instructions, add NEXTAUTH_URL
3. `DEPLOY_CHECKLIST.md` — update completed items

## Out of Scope

- CSP nonce-based script loading (future improvement)
- Database engine migration (separate effort)
- Error tracking integration (separate effort)
- Test suite (separate effort)
