import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    playlist: {
      findFirst: vi.fn(),
    },
    playlistTrack: {
      findMany: vi.fn(),
    },
    quizAttempt: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("@/lib/api-security", () => ({
  enforcePlaylistWriteRateLimit: vi.fn().mockResolvedValue(null),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { createQuizSessionToken } from "@/lib/quiz-session";
import { GET, POST } from "../route";

const TEST_USER_ID = "cltestuserid000000000001";
const TEST_PLAYLIST_ID = "cltestplaylistid0000001";
const TEST_TRACK_ID_1 = "cltesttrackid00000000001";
const TEST_TRACK_ID_2 = "cltesttrackid00000000002";

const mockSession = {
  user: { id: TEST_USER_ID, name: "Test User", email: "test@example.com" },
};

const makePlaylist = (overrides: Record<string, unknown> = {}) => ({
  id: TEST_PLAYLIST_ID,
  userId: TEST_USER_ID,
  isQuiz: true,
  isPublic: false,
  ...overrides,
});

const makeTrack = (trackId: string, title: string) => ({
  trackId,
  title,
  sourceType: "youtube",
  youtubeVideoId: trackId,
  playlistId: TEST_PLAYLIST_ID,
});

const makeAttempt = (overrides: Record<string, unknown> = {}) => ({
  id: "clattemptid000000000001",
  playlistId: TEST_PLAYLIST_ID,
  userId: TEST_USER_ID,
  score: 2,
  totalQuestions: 2,
  difficulty: "normal",
  answerMode: "typed",
  createdAt: new Date("2024-01-01"),
  user: { name: "Test User", email: "test@example.com" },
  ...overrides,
});

const makeToken = (trackIds = [TEST_TRACK_ID_1, TEST_TRACK_ID_2]) =>
  createQuizSessionToken({
    userId: TEST_USER_ID,
    playlistId: TEST_PLAYLIST_ID,
    trackIds,
  });

describe("GET /api/quiz/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/quiz/attempts?playlistId=" + TEST_PLAYLIST_ID);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing or invalid playlistId query param", async () => {
    const req = new Request("http://localhost/api/quiz/attempts");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when playlist is not accessible", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(null);
    const req = new Request("http://localhost/api/quiz/attempts?playlistId=" + TEST_PLAYLIST_ID);
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns leaderboard and userHistory for accessible playlist", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.quizAttempt.findMany)
      .mockResolvedValueOnce([makeAttempt()] as never) // leaderboard query
      .mockResolvedValueOnce([makeAttempt()] as never); // user history query
    const req = new Request("http://localhost/api/quiz/attempts?playlistId=" + TEST_PLAYLIST_ID);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.leaderboard)).toBe(true);
    expect(Array.isArray(body.userHistory)).toBe(true);
    expect(body.leaderboard[0].score).toBe(2);
  });

  it("leaderboard shows at most one entry per user (best score)", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    // Two attempts from the same user — should only appear once in leaderboard
    vi.mocked(db.quizAttempt.findMany)
      .mockResolvedValueOnce([makeAttempt({ score: 2 }), makeAttempt({ score: 1 })] as never)
      .mockResolvedValueOnce([] as never);
    const req = new Request("http://localhost/api/quiz/attempts?playlistId=" + TEST_PLAYLIST_ID);
    const res = await GET(req);
    const body = await res.json();
    expect(body.leaderboard).toHaveLength(1);
  });
});

describe("POST /api/quiz/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/quiz/attempts", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/quiz/attempts", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when playlist not found", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(null);
    const token = makeToken();
    const req = new Request("http://localhost/api/quiz/attempts", {
      method: "POST",
      body: JSON.stringify({
        playlistId: TEST_PLAYLIST_ID,
        difficulty: "normal",
        answerMode: "typed",
        quizSessionToken: token,
        answers: [
          { trackId: TEST_TRACK_ID_1, userAnswer: "Test" },
          { trackId: TEST_TRACK_ID_2, userAnswer: "Test" },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 401 for invalid quiz session token", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    // Token must pass Zod min(32) and have 3 dot-separated parts, but carry a wrong signature
    const badToken = "aaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbb.cccccccccccccccccc";
    const req = new Request("http://localhost/api/quiz/attempts", {
      method: "POST",
      body: JSON.stringify({
        playlistId: TEST_PLAYLIST_ID,
        difficulty: "normal",
        answerMode: "typed",
        quizSessionToken: badToken,
        answers: [
          { trackId: TEST_TRACK_ID_1, userAnswer: "Test" },
          { trackId: TEST_TRACK_ID_2, userAnswer: "Test" },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when playlist is not a quiz", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist({ isQuiz: false }) as never);
    const token = makeToken();
    const req = new Request("http://localhost/api/quiz/attempts", {
      method: "POST",
      body: JSON.stringify({
        playlistId: TEST_PLAYLIST_ID,
        difficulty: "normal",
        answerMode: "typed",
        quizSessionToken: token,
        answers: [
          { trackId: TEST_TRACK_ID_1, userAnswer: "Test" },
          { trackId: TEST_TRACK_ID_2, userAnswer: "Test" },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/not a quiz/i);
  });

  it("computes score correctly — counts only exact/fuzzy matches", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlistTrack.findMany).mockResolvedValue([
      makeTrack(TEST_TRACK_ID_1, "Bohemian Rhapsody"),
      makeTrack(TEST_TRACK_ID_2, "Hotel California"),
    ] as never);
    vi.mocked(db.quizAttempt.create).mockResolvedValue({
      id: "clattemptid000000000001",
      score: 1,
      totalQuestions: 2,
    } as never);

    const token = makeToken();
    const req = new Request("http://localhost/api/quiz/attempts", {
      method: "POST",
      body: JSON.stringify({
        playlistId: TEST_PLAYLIST_ID,
        difficulty: "normal",
        answerMode: "typed",
        quizSessionToken: token,
        answers: [
          { trackId: TEST_TRACK_ID_1, userAnswer: "Bohemian Rhapsody" }, // correct
          { trackId: TEST_TRACK_ID_2, userAnswer: "Wrong Answer" },       // wrong
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    // Verify create was called with score=1 (one correct answer)
    expect(vi.mocked(db.quizAttempt.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ score: 1, totalQuestions: 2 }),
      }),
    );
  });

  it("returns 400 for duplicate track answers", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlistTrack.findMany).mockResolvedValue([
      makeTrack(TEST_TRACK_ID_1, "Song One"),
      makeTrack(TEST_TRACK_ID_2, "Song Two"),
    ] as never);

    const token = makeToken();
    const req = new Request("http://localhost/api/quiz/attempts", {
      method: "POST",
      body: JSON.stringify({
        playlistId: TEST_PLAYLIST_ID,
        difficulty: "normal",
        answerMode: "typed",
        quizSessionToken: token,
        answers: [
          { trackId: TEST_TRACK_ID_1, userAnswer: "Song One" },
          { trackId: TEST_TRACK_ID_1, userAnswer: "Song One" }, // duplicate
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/duplicate/i);
  });
});
