import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { apiError, zodErrorDetails } from "@/lib/api-response";
import { authOptions } from "@/lib/auth";
import { QUIZ_ANSWER_MODE_VALUES } from "@/lib/quiz-answer-mode";
import {
  QUIZ_DIFFICULTY_VALUES,
  getSnippetDurationSeconds,
  pickSnippetStart,
} from "@/lib/quiz-difficulty";
import { shuffleItems } from "@/lib/quiz-utils";
import { createSurvivalSessionToken } from "@/lib/survival-session";
import {
  listCatalogCategories,
  pickDistractorTitles,
  pickRandomCatalogTrack,
  slugifyCategory,
} from "@/lib/survival-catalog";

const ROUTE = "quiz-survival-start";

const bodySchema = z
  .object({
    difficulty: z.enum(QUIZ_DIFFICULTY_VALUES),
    answerMode: z.enum(QUIZ_ANSWER_MODE_VALUES),
    // Optional category slug (e.g. "j-pop"). Validated against the
    // distinct-categories list so an attacker can't bake arbitrary filter
    // strings into the signed token.
    categorySlug: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError({ status: 401, code: "UNAUTHENTICATED", message: "Sign in required", log: { route: ROUTE } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: "INVALID_BODY", message: "Invalid JSON body", log: { route: ROUTE } });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      code: "INVALID_BODY",
      message: "Invalid survival setup",
      details: zodErrorDetails(parsed.error),
      log: { route: ROUTE, userId: session.user.id },
    });
  }

  const { difficulty, answerMode, categorySlug } = parsed.data;

  let category: string | null = null;
  if (categorySlug) {
    const categories = await listCatalogCategories();
    const match = categories.find((c) => slugifyCategory(c.category) === categorySlug);
    if (!match) {
      return apiError({
        status: 404,
        code: "UNKNOWN_CATEGORY",
        message: "That category has no tracks yet.",
        log: { route: ROUTE, userId: session.user.id },
      });
    }
    category = match.category;
  }

  const track = await pickRandomCatalogTrack([], { category });
  if (!track) {
    return apiError({
      status: 409,
      code: "EMPTY_CATALOG",
      message: category
        ? `The "${category}" category has no tracks yet.`
        : "The survival catalog is empty. Ask an admin to add tracks.",
      log: { route: ROUTE, userId: session.user.id },
    });
  }

  const snippetSeconds = getSnippetDurationSeconds(difficulty);
  const snippetStart = pickSnippetStart(track.duration, snippetSeconds);

  const token = createSurvivalSessionToken({
    userId: session.user.id,
    difficulty,
    answerMode,
    category,
    score: 0,
    strikes: 0,
    strikesAllowed: 3,
    seen: [track.id],
    pendingId: track.id,
    pendingStart: snippetStart,
  });

  const options =
    answerMode === "multiple_choice"
      ? shuffleItems([
          track.title,
          ...(await pickDistractorTitles(track.id, 3, { category })),
        ])
      : undefined;

  return NextResponse.json({
    token,
    score: 0,
    strikes: 0,
    strikesAllowed: 3,
    category,
    question: {
      id: track.id,
      youtubeVideoId: track.youtubeVideoId,
      duration: track.duration,
      snippetStart,
      snippetSeconds,
      options,
    },
  });
}
