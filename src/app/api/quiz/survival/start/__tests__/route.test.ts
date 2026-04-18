import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/survival-catalog", () => ({
  listCatalogCategories: vi.fn(),
  pickDistractorTitles: vi.fn(),
  pickRandomCatalogTrack: vi.fn(),
  slugifyCategory: (v: string) =>
    v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
}));
vi.mock("@/lib/survival-session", () => ({
  createSurvivalSessionToken: vi.fn(() => "mock-token"),
}));

import { getServerSession } from "next-auth";

import {
  listCatalogCategories,
  pickDistractorTitles,
  pickRandomCatalogTrack,
} from "@/lib/survival-catalog";
import { createSurvivalSessionToken } from "@/lib/survival-session";

import { POST } from "../route";

const USER = { user: { id: "user-1" } };

const SAMPLE_TRACK = {
  id: "track-1",
  title: "Lemon",
  artist: "Kenshi Yonezu",
  album: "",
  duration: 180,
  cover: "",
  youtubeVideoId: "abc123",
};

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/quiz/survival/start", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue(USER as never);
  vi.mocked(pickRandomCatalogTrack).mockResolvedValue(SAMPLE_TRACK as never);
  vi.mocked(pickDistractorTitles).mockResolvedValue(["A", "B", "C"]);
  vi.mocked(listCatalogCategories).mockResolvedValue([
    { category: "J-Pop", count: 10 },
    { category: "Anime Openings", count: 5 },
  ]);
});

describe("POST /api/quiz/survival/start", () => {
  it("starts an unfiltered run when no categorySlug is supplied", async () => {
    const res = await POST(
      jsonRequest({ difficulty: "normal", answerMode: "typed" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("mock-token");
    expect(body.category).toBeNull();
    // No filter should reach the picker.
    expect(pickRandomCatalogTrack).toHaveBeenCalledWith([], { category: null });
    // And no category should be baked into the token.
    expect(vi.mocked(createSurvivalSessionToken).mock.calls[0][0]).toMatchObject({
      category: null,
    });
  });

  it("resolves a valid categorySlug to its canonical name and passes it to picker + token", async () => {
    const res = await POST(
      jsonRequest({ difficulty: "normal", answerMode: "typed", categorySlug: "j-pop" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.category).toBe("J-Pop");
    expect(pickRandomCatalogTrack).toHaveBeenCalledWith([], { category: "J-Pop" });
    expect(vi.mocked(createSurvivalSessionToken).mock.calls[0][0]).toMatchObject({
      category: "J-Pop",
    });
  });

  it("filters distractors by category in multiple-choice mode", async () => {
    await POST(
      jsonRequest({
        difficulty: "normal",
        answerMode: "multiple_choice",
        categorySlug: "j-pop",
      }),
    );
    expect(pickDistractorTitles).toHaveBeenCalledWith("track-1", 3, { category: "J-Pop" });
  });

  it("returns 404 when the categorySlug doesn't match any catalog category", async () => {
    const res = await POST(
      jsonRequest({ difficulty: "normal", answerMode: "typed", categorySlug: "non-existent" }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("UNKNOWN_CATEGORY");
    // Must not attempt to pick a track if the slug was invalid.
    expect(pickRandomCatalogTrack).not.toHaveBeenCalled();
  });

  it("returns 409 with a category-aware message when the filtered pool is empty", async () => {
    vi.mocked(pickRandomCatalogTrack).mockResolvedValueOnce(null);
    const res = await POST(
      jsonRequest({ difficulty: "normal", answerMode: "typed", categorySlug: "j-pop" }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("EMPTY_CATALOG");
    expect(body.message).toMatch(/J-Pop/);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(jsonRequest({ difficulty: "normal", answerMode: "typed" }));
    expect(res.status).toBe(401);
  });
});
