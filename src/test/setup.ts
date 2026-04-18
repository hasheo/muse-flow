// Environment variables required by API route handlers and lib modules during unit tests.
// These are safe placeholder values — never used in production.
//
// Set every var the env validator (`src/lib/env.ts`) requires so validation
// succeeds and `env` becomes a typed snapshot — matching CI's behavior. If
// validation fails (e.g. missing DATABASE_URL), the validator falls back to
// returning live `process.env`, which masks bugs where production code reads
// from the cached snapshot but tests mutate `process.env` directly.
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.NEXTAUTH_SECRET = "test-nextauth-secret-for-unit-tests-only";
process.env.QUIZ_SESSION_SECRET = "test-quiz-session-secret-for-unit-tests";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.YOUTUBE_API_KEY = "test-youtube-api-key";
