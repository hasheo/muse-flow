import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    playlist: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    playlistTrack: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/api-security", () => ({
  enforcePlaylistWriteRateLimit: vi.fn().mockResolvedValue(null),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { DELETE, PATCH, POST } from "../route";

const TEST_USER_ID = "cltestuserid000000000001";
const TEST_PLAYLIST_ID = "cltestplaylistid0000001";
const TEST_TRACK_ID = "yt-dQw4w9WgXcQ";

const mockSession = {
  user: { id: TEST_USER_ID, name: "Test User", email: "test@example.com" },
};

const makePlaylist = (overrides: Record<string, unknown> = {}) => ({
  id: TEST_PLAYLIST_ID,
  name: "Test Playlist",
  userId: TEST_USER_ID,
  isQuiz: false,
  isPublic: false,
  ...overrides,
});

const makeTrack = (overrides: Record<string, unknown> = {}) => ({
  id: "cltrackrecord0000000001",
  playlistId: TEST_PLAYLIST_ID,
  trackId: TEST_TRACK_ID,
  title: "Never Gonna Give You Up",
  artist: "Rick Astley",
  album: "YouTube Music",
  duration: 213,
  cover: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  sourceType: "youtube",
  youtubeVideoId: "dQw4w9WgXcQ",
  mimeType: null,
  sourcePath: null,
  position: 0,
  createdAt: new Date("2024-01-01"),
  ...overrides,
});

const makeParams = (id = TEST_PLAYLIST_ID) => ({
  params: Promise.resolve({ id }),
});

const trackPayload = {
  id: TEST_TRACK_ID,
  sourceType: "youtube" as const,
  title: "Never Gonna Give You Up",
  artist: "Rick Astley",
  album: "YouTube Music",
  duration: 213,
  cover: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  youtubeVideoId: "dQw4w9WgXcQ",
};

describe("POST /api/playlists/[id]/tracks (add track)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
    vi.mocked(db.$transaction).mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops;
    });
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "POST",
      body: JSON.stringify({ track: trackPayload }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when playlist not found", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "POST",
      body: JSON.stringify({ track: trackPayload }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid track payload", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "POST",
      body: JSON.stringify({ track: { title: "Missing fields" } }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("adds track to playlist and returns playlistTrackId", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlistTrack.findFirst).mockResolvedValue(null);
    vi.mocked(db.playlistTrack.upsert).mockResolvedValue(makeTrack() as never);
    vi.mocked(db.playlist.update).mockResolvedValue(makePlaylist() as never);

    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "POST",
      body: JSON.stringify({ track: trackPayload }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Track saved to playlist");
    expect(body.playlistTrackId).toBeDefined();
  });

  it("assigns position 0 when playlist is empty", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlistTrack.findFirst).mockResolvedValue(null); // no existing tracks
    vi.mocked(db.playlistTrack.upsert).mockResolvedValue(makeTrack({ position: 0 }) as never);
    vi.mocked(db.playlist.update).mockResolvedValue(makePlaylist() as never);

    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "POST",
      body: JSON.stringify({ track: trackPayload }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req, makeParams());

    const upsertCall = vi.mocked(db.playlistTrack.upsert).mock.calls[0][0];
    expect(upsertCall.create.position).toBe(0);
  });

  it("assigns next position when playlist already has tracks", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlistTrack.findFirst).mockResolvedValue(makeTrack({ position: 2 }) as never);
    vi.mocked(db.playlistTrack.upsert).mockResolvedValue(makeTrack({ position: 3 }) as never);
    vi.mocked(db.playlist.update).mockResolvedValue(makePlaylist() as never);

    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "POST",
      body: JSON.stringify({ track: trackPayload }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req, makeParams());

    const upsertCall = vi.mocked(db.playlistTrack.upsert).mock.calls[0][0];
    expect(upsertCall.create.position).toBe(3);
  });
});

describe("DELETE /api/playlists/[id]/tracks (remove track)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
    vi.mocked(db.$transaction).mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops;
    });
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "DELETE",
      body: JSON.stringify({ trackId: TEST_TRACK_ID }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when playlist not found", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "DELETE",
      body: JSON.stringify({ trackId: TEST_TRACK_ID }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(404);
  });

  it("removes track and re-indexes positions", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlistTrack.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.playlistTrack.findMany).mockResolvedValue([
      makeTrack({ id: "clrec0000000000000000001", position: 1 }),
      makeTrack({ id: "clrec0000000000000000002", trackId: "yt-other", position: 2 }),
    ] as never);
    vi.mocked(db.playlistTrack.update).mockResolvedValue(makeTrack() as never);
    vi.mocked(db.playlist.update).mockResolvedValue(makePlaylist() as never);

    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "DELETE",
      body: JSON.stringify({ trackId: TEST_TRACK_ID }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Track removed from playlist");
    // $transaction called to re-index positions
    expect(vi.mocked(db.$transaction)).toHaveBeenCalled();
  });
});

describe("PATCH /api/playlists/[id]/tracks (reorder)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession as never);
    vi.mocked(db.$transaction).mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops;
    });
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "PATCH",
      body: JSON.stringify({ trackIds: [TEST_TRACK_ID] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 400 when reorder count mismatches existing tracks", async () => {
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlistTrack.findMany).mockResolvedValue([
      makeTrack(),
      makeTrack({ trackId: "yt-other" }),
    ] as never);
    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "PATCH",
      body: JSON.stringify({ trackIds: [TEST_TRACK_ID] }), // only 1, but 2 exist
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("reorders tracks and returns success", async () => {
    const trackId2 = "yt-other0000000000000000";
    vi.mocked(db.playlist.findFirst).mockResolvedValue(makePlaylist() as never);
    vi.mocked(db.playlistTrack.findMany).mockResolvedValue([
      makeTrack({ trackId: TEST_TRACK_ID }),
      makeTrack({ trackId: trackId2 }),
    ] as never);
    vi.mocked(db.playlistTrack.update).mockResolvedValue(makeTrack() as never);
    vi.mocked(db.playlist.update).mockResolvedValue(makePlaylist() as never);

    const req = new Request("http://localhost/api/playlists/" + TEST_PLAYLIST_ID + "/tracks", {
      method: "PATCH",
      body: JSON.stringify({ trackIds: [trackId2, TEST_TRACK_ID] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Playlist reordered");
  });
});
