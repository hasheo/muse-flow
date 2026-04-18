import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    catalogTrack: {
      groupBy: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";

import { db } from "@/lib/db";

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/quiz/categories", () => {
  it("returns 401 when not signed in", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns categories with slugs and counts", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1" },
    } as never);
    vi.mocked(db.catalogTrack.groupBy).mockResolvedValue([
      { category: "J-Pop", _count: { _all: 12 } },
      { category: "Anime Openings", _count: { _all: 7 } },
    ] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toEqual([
      { name: "J-Pop", slug: "j-pop", count: 12 },
      { name: "Anime Openings", slug: "anime-openings", count: 7 },
    ]);
  });

  it("excludes categories where groupBy produced a null bucket", async () => {
    // Prisma's groupBy returns null-category rows even when we filter — our
    // lib strips them so the UI doesn't render a blank card.
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1" },
    } as never);
    vi.mocked(db.catalogTrack.groupBy).mockResolvedValue([
      { category: null, _count: { _all: 3 } },
      { category: "K-Pop", _count: { _all: 5 } },
    ] as never);

    const res = await GET();
    const body = await res.json();
    expect(body.categories).toEqual([{ name: "K-Pop", slug: "k-pop", count: 5 }]);
  });
});
