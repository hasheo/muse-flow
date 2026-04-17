# MuseFlow - Spotify / YouTube Music Clone

A full-stack music player clone built with:

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn-style UI primitives
- TanStack Query + Zustand
- NextAuth (credentials)
- YouTube IFrame Player API
- Prisma + PostgreSQL

## Features

- Credential auth with NextAuth
- Protected `/app` route
- YouTube track catalog API (`/api/tracks`)
- Global player queue/state (Zustand)
- Music fetch/cache (TanStack Query)
- Play/pause/seek/volume/next/previous
- YouTube music search + playback (requires API key)
- Playlist pribadi (buat playlist + simpan lagu favorit)

## Demo account

- Email: `demo@music.dev`
- Password: `password123`

## Setup

### 1. Start PostgreSQL

The app is configured for PostgreSQL (see `prisma/schema.prisma`). The quickest way to run one locally:

```bash
docker run --name museflow-db \
  -e POSTGRES_USER=museflow \
  -e POSTGRES_PASSWORD=museflow \
  -e POSTGRES_DB=museflow \
  -p 5432:5432 \
  -d postgres:16
```

Then copy `.env.example` to `.env` and update `DATABASE_URL` to match.

### 2. Install, migrate, seed, run

```bash
npm install
npm run db:migrate:dev
npm run db:seed
npm run dev
```

Open http://localhost:3000

## Notes

- Env template is in `.env.example`.
- Set `YOUTUBE_API_KEY` in `.env` to enable YouTube search.
- For production, restrict `YOUTUBE_API_KEY` in Google Cloud (API restriction: YouTube Data API v3, plus app/IP/referrer limits and quota alerts).
- `/api/youtube/search` and `/api/tracks` require authenticated sessions.
- To enable Google Sign-In, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- For production deploy, use `npm run db:migrate:deploy` instead of `db:push`.
