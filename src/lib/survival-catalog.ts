import { db } from "@/lib/db";

export type SurvivalCatalogTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  youtubeVideoId: string;
};

const SELECT = {
  id: true,
  title: true,
  artist: true,
  album: true,
  duration: true,
  cover: true,
  youtubeVideoId: true,
} as const;

type PickOptions = {
  category?: string | null;
};

function buildCategoryFilter(category?: string | null) {
  if (!category) return {};
  // Admin-authored category strings are free-text; match case-insensitively so
  // "J-Pop" and "j-pop" in the catalog both resolve. The DB has an index on
  // `category` — a case-insensitive filter can't fully use it, but category
  // cardinality is low so the planner still picks it for selectivity.
  return { category: { equals: category, mode: "insensitive" as const } };
}

/**
 * Pick a single random catalog track excluding any ids in the exclude list.
 * Uses two queries (count + offset) to avoid pulling the whole catalog.
 * When `category` is provided, only tracks in that category are considered.
 */
export async function pickRandomCatalogTrack(
  excludeIds: string[],
  options: PickOptions = {},
): Promise<SurvivalCatalogTrack | null> {
  const where = {
    ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    ...buildCategoryFilter(options.category),
  };
  const total = await db.catalogTrack.count({ where });
  if (!total) return null;

  const skip = Math.floor(Math.random() * total);
  const result = await db.catalogTrack.findFirst({
    where,
    select: SELECT,
    orderBy: { id: "asc" },
    skip,
    take: 1,
  });
  return result;
}

/**
 * Fetch up to `count` random catalog tracks for use as distractors in
 * multiple-choice rounds. Skips the target (correct) track id. When a
 * category is supplied, distractors are pulled from the same category so
 * multiple-choice stays thematic (e.g. Anime ops vs. Anime ops).
 */
export async function pickDistractorTitles(
  correctId: string,
  count: number,
  options: PickOptions = {},
): Promise<string[]> {
  const take = Math.max(count * 3, 12);
  const where = {
    id: { not: correctId },
    ...buildCategoryFilter(options.category),
  };
  const total = await db.catalogTrack.count({ where });
  if (!total) return [];

  const skip = Math.max(0, Math.floor(Math.random() * Math.max(1, total - take)));
  const candidates = await db.catalogTrack.findMany({
    where,
    select: { title: true },
    orderBy: { id: "asc" },
    skip,
    take,
  });

  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    const key = candidate.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate.title);
    if (out.length >= count) break;
  }
  return out;
}

export async function getCatalogTrackById(id: string): Promise<SurvivalCatalogTrack | null> {
  return db.catalogTrack.findUnique({ where: { id }, select: SELECT });
}

/**
 * Return the list of distinct, non-null categories currently represented in
 * the catalog together with track counts. Used by the /quiz/category lobby
 * and to validate category slugs at the start of a run.
 */
export async function listCatalogCategories(): Promise<
  Array<{ category: string; count: number }>
> {
  const rows = await db.catalogTrack.groupBy({
    by: ["category"],
    where: { category: { not: null } },
    _count: { _all: true },
    orderBy: { category: "asc" },
  });
  return rows
    .filter((row): row is typeof row & { category: string } => typeof row.category === "string")
    .map((row) => ({ category: row.category, count: row._count._all }));
}

/**
 * URL-safe slug for a category name. Shared between the list page and the
 * route validator so both sides agree on how "J-Pop" maps to "j-pop".
 */
export function slugifyCategory(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
