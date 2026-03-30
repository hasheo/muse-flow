import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    playlist: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/lib/api-security", () => ({
  enforcePlaylistWriteRateLimit: vi.fn().mockResolvedValue(null),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { DELETE, GET, PATCH } from "../route";

const TEST_USER_ID = "cltestuserid000000000001";
const TEST_PLAYLIST_ID = "cltestplaylistid0000001";
const OTHER_USER_ID = "cltestotheruserid00000001";

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
  tracks: [],
  ...overrides,
});

const makeParams = (id = TEST_PLAYLIST_ID) => ({
  params: Promise.resolve({ id }),
});

describe("GET /api/playlists/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      name: "Test User",
      email: "test@example.com",
    } as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID);
    const res = await GET(req, makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid playlist id format", async () => {
    const req = new Request("http://localhost/api/playlists/not-a-valid-cuid");
    const res = await GET(req, makeParams("not-a-valid-cuid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when playlist does not exist", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID);
    const res = await GET(req, makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 404 when playlist belongs to another user and is not public quiz", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(
      makePlaylist({ userId: OTHER_USER_ID, isQuiz: false, isPublic: false }) as never,
    );
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID);
    const res = await GET(req, makeParams());
    expect(res.status).toBe(404);
  });

  it("returns playlist for the owner", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID);
    const res = await GET(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playlist.id).toBe(TEST_PLAYLIST_ID);
    expect(body.tracks).toEqual([]);
  });

  it("returns null quizSessionToken for non-quiz playlist", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist({ isQuiz: false }) as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID);
    const res = await GET(req, makeParams());
    const body = await res.json();
    expect(body.quizSessionToken).toBeNull();
  });

  it("returns a quizSessionToken for a quiz playlist", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist({ isQuiz: true }) as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID);
    const res = await GET(req, makeParams());
    const body = await res.json();
    expect(typeof body.quizSessionToken).toBe("string");
    expect(body.quizSessionToken.length).toBeGreaterThan(0);
  });

  it("allows access to a public quiz playlist by another user", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(
      makePlaylist({ userId: OTHER_USER_ID, isQuiz: true, isPublic: true }) as never,
    );
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID);
    const res = await GET(req, makeParams());
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/playlists/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID, { method: "PATCH" });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when playlist not found", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 400 for empty patch body", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID, {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
  });

  it("updates playlist name and returns updated data", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlist.update).mockResolvedValue(makePlaylist({ name: "Updated Name" }) as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Name" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playlist.name).toBe("Updated Name");
  });

  it("can toggle isPublic on a quiz playlist", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist({ isQuiz: true }) as never);
    vi.mocked(db.playlist.update).mockResolvedValue(makePlaylist({ isQuiz: true, isPublic: true }) as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID, {
      method: "PATCH",
      body: JSON.stringify({ isPublic: true }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playlist.isPublic).toBe(true);
  });
});

describe("DELETE /api/playlists/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID, { method: "DELETE" });
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when playlist not found", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID, { method: "DELETE" });
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(404);
  });

  it("deletes playlist and returns success message", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlist.delete).mockResolvedValue(makePlaylist() as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID, { method: "DELETE" });
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBeDefined();
  });

  it("only deletes playlists owned by the requesting user", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlist.delete).mockResolvedValue(makePlaylist() as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID, { method: "DELETE" });
    await DELETE(req, makeParams());
    expect(vi.mocked(db.playlist.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TEST_PLAYLIST_ID, userId: TEST_USER_ID } }),
    );
  });
});
