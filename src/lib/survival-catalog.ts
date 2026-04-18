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

/**
 * Pick a single random catalog track excluding any ids in the exclude list.
 * Uses two queries (count + offset) to avoid pulling the whole catalog.
 */
export async function pickRandomCatalogTrack(
  excludeIds: string[],
): Promise<SurvivalCatalogTrack | null> {
  const where = excludeIds.length ? { id: { notIn: excludeIds } } : {};
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
 * multiple-choice rounds. Skips the target (correct) track id.
 */
export async function pickDistractorTitles(
  correctId: string,
  count: number,
): Promise<string[]> {
  const take = Math.max(count * 3, 12);
  const total = await db.catalogTrack.count({ where: { id: { not: correctId } } });
  if (!total) return [];

  const skip = Math.max(0, Math.floor(Math.random() * Math.max(1, total - take)));
  const candidates = await db.catalogTrack.findMany({
    where: { id: { not: correctId } },
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
