// Environment variables required by API route handlers and lib modules during unit tests.
// These are safe placeholder values — never used in production.
process.env.NEXTAUTH_SECRET = "test-nextauth-secret-for-unit-tests-only";
process.env.QUIZ_SESSION_SECRET = "test-quiz-session-secret-for-unit-tests";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.YOUTUBE_API_KEY = "test-youtube-api-key";
