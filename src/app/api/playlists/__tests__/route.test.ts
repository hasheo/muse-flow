import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    playlist: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    playlistCollaborator: {
      findMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/api-security", () => ({
  enforcePlaylistWriteRateLimit: vi.fn().mockResolvedValue(null),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { GET, POST } from "../route";

const TEST_USER_ID = "cltestuserid000000000001";
const TEST_PLAYLIST_ID = "cltestplaylistid0000001";

const mockSession = {
  user: { id: TEST_USER_ID, name: "Test User", email: "test@example.com" },
};

const makePlaylist = (overrides: Record<string, unknown> = {}) => ({
  id: TEST_PLAYLIST_ID,
  name: "Test Playlist",
  cover: "https://example.com/cover.jpg",
  isQuiz: false,
  isPublic: false,
  difficulty: "normal",
  answerMode: "typed",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  userId: TEST_USER_ID,
  _count: { tracks: 0 },
  ...overrides,
});

describe("GET /api/playlists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
    vi.mocked(db.playlistCollaborator.findMany).mockResolvedValue([] as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns playlists for authenticated user", async () => {
    vi.mocked(db.playlist.findMany).mockResolvedValue([makePlaylist()] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playlists).toHaveLength(1);
    expect(body.playlists[0].id).toBe(TEST_PLAYLIST_ID);
    expect(body.playlists[0].trackCount).toBe(0);
  });

  it("returns empty list when user has no playlists", async () => {
    vi.mocked(db.playlist.findMany).mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playlists).toHaveLength(0);
  });

  it("queries only the authenticated user's playlists", async () => {
    vi.mocked(db.playlist.findMany).mockResolvedValue([]);
    await GET();
    expect(vi.mocked(db.playlist.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: TEST_USER_ID } }),
    );
  });

  it("exposes trackCount from _count.tracks", async () => {
    vi.mocked(db.playlist.findMany).mockResolvedValue([makePlaylist({ _count: { tracks: 7 } })] as never);
    const res = await GET();
    const body = await res.json();
    expect(body.playlists[0].trackCount).toBe(7);
  });
});

describe("POST /api/playlists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/playlists", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_JSON");
  });

  it("returns 400 when name is missing", async () => {
    const req = new Request("http://localhost/api/playlists", {
      method: "POST",
      body: JSON.stringify({ isQuiz: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name exceeds 80 characters", async () => {
    const req = new Request("http://localhost/api/playlists", {
      method: "POST",
      body: JSON.stringify({ name: "a".repeat(81) }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("creates a regular playlist and returns 201", async () => {
    vi.mocked(db.playlist.create).mockResolvedValue(makePlaylist({ name: "New Playlist" }) as never);
    const req = new Request("http://localhost/api/playlists", {
      method: "POST",
      body: JSON.stringify({ name: "New Playlist" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.playlist.name).toBe("New Playlist");
    expect(body.playlist.trackCount).toBe(0);
  });

  it("creates a quiz playlist with custom settings", async () => {
    vi.mocked(db.playlist.create).mockResolvedValue(
      makePlaylist({ isQuiz: true, isPublic: true, difficulty: "hard", answerMode: "multiple_choice" }) as never,
    );
    const req = new Request("http://localhost/api/playlists", {
      method: "POST",
      body: JSON.stringify({ name: "Quiz Night", isQuiz: true, isPublic: true, difficulty: "hard", answerMode: "multiple_choice" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.playlist.isQuiz).toBe(true);
    expect(body.playlist.difficulty).toBe("hard");
  });

  it("returns 400 for unknown extra fields (strict schema)", async () => {
    const req = new Request("http://localhost/api/playlists", {
      method: "POST",
      body: JSON.stringify({ name: "Test", unknownField: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
