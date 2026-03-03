# Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add security headers, harden secret management, and update the deploy checklist for Vercel deployment.

**Architecture:** Security headers configured via `next.config.ts` `headers()` function (Vercel-idiomatic). CSP tuned for YouTube IFrame API + Tailwind inline styles. Secret management improved via `.env.example` documentation.

**Tech Stack:** Next.js 16 config, Vercel deployment

---

### Task 1: Add Security Headers to `next.config.ts`

**Files:**
- Modify: `next.config.ts`

**Step 1: Add the security headers configuration**

Replace the entire content of `next.config.ts` with:

```typescript
import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com",
      "frame-src https://www.youtube.com",
      "img-src 'self' https://i.ytimg.com https://images.unsplash.com data:",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://www.googleapis.com",
      "font-src 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
```

**Step 2: Verify config is valid**

Run: `npx next lint`
Expected: No errors related to next.config.ts

**Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 4: Commit**

```bash
git add next.config.ts
git commit -m "feat: add security headers to next.config.ts

Add X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
Strict-Transport-Security, Permissions-Policy, and CSP headers.
CSP tuned for YouTube IFrame API and Tailwind inline styles."
```

---

### Task 2: Harden Secret Management in `.env.example`

**Files:**
- Modify: `.env.example`

**Step 1: Update `.env.example` with improved secret guidance**

Replace the entire content of `.env.example` with:

```bash
# Database
DATABASE_URL="file:./dev.db"

# NextAuth.js
# IMPORTANT: Generate a strong secret for production:
#   openssl rand -base64 32
# Never use the default value in production.
NEXTAUTH_SECRET="change-me-in-production"

# Set to your production domain (e.g. https://museflow.example.com)
# Required for NextAuth.js to work correctly in production.
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth (optional — leave empty to disable Google sign-in)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# YouTube Data API v3
# Get a key at https://console.cloud.google.com/apis/credentials
# For production: restrict by HTTP referrer and set quota alerts.
YOUTUBE_API_KEY="your-youtube-data-api-v3-key"

# Upstash Redis (optional — falls back to in-memory rate limiting)
UPSTASH_REDIS_REST_URL="https://<your-upstash-endpoint>.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-rest-token"
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: improve .env.example with secret generation instructions

Add openssl command for NEXTAUTH_SECRET, document NEXTAUTH_URL
production requirement, add guidance for YouTube API key restrictions
and Upstash Redis optional configuration."
```

---

### Task 3: Update Deploy Checklist

**Files:**
- Modify: `DEPLOY_CHECKLIST.md`

**Step 1: Update the checklist to reflect security headers work**

In section `## 2) Environment and secrets`, the items remain unchecked (they require manual production action), but add a note:

After the line `- [ ] Separate env values prepared for production (no dev defaults).`, add:
```
  - `.env.example` now includes generation instructions for `NEXTAUTH_SECRET` and production guidance for `NEXTAUTH_URL`.
```

In section `## 4) API hardening`, after `- [ ] Standardize API error format + request id for tracing.`, add a new checked item:
```
- [x] Security headers configured (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
  - Configured in `next.config.ts` `headers()` for all routes.
```

**Step 2: Commit**

```bash
git add DEPLOY_CHECKLIST.md
git commit -m "docs: update deploy checklist with security headers status"
```

---

### Task 4: Smoke Test

**Step 1: Start the dev server and verify headers**

Run: `npm run dev`

Then in a separate terminal:
```bash
curl -s -D - -o /dev/null http://localhost:3000 2>&1 | grep -i -E "x-frame|x-content-type|referrer-policy|strict-transport|permissions-policy|content-security-policy"
```

Expected: All 6 security headers present in the response.

**Step 2: Verify the app loads correctly in the browser**

Open `http://localhost:3000` and check:
- Page loads without CSP errors in the browser console
- YouTube player works (search + play a track)
- No blocked resources in the console

If CSP violations appear, adjust the CSP directives in `next.config.ts` accordingly.

**Step 3: Stop the dev server**
