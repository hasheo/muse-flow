import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { apiError, zodErrorDetails } from "@/lib/api-response";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { coerceQuizAnswerMode } from "@/lib/quiz-answer-mode";
import {
  coerceQuizDifficulty,
  getSnippetDurationSeconds,
  pickSnippetStart,
} from "@/lib/quiz-difficulty";
import { isQuizAnswerCorrect } from "@/lib/quiz-text";
import { shuffleItems } from "@/lib/quiz-utils";
import {
  getCatalogTrackById,
  pickDistractorTitles,
  pickRandomCatalogTrack,
} from "@/lib/survival-catalog";
import {
  createSurvivalSessionToken,
  verifySurvivalSessionToken,
} from "@/lib/survival-session";

const ROUTE = "quiz-survival-next";

const bodySchema = z
  .object({
    token: z.string().min(1),
    answer: z.string().max(300),
    timedOut: z.boolean().optional(),
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
      message: "Invalid survival answer payload",
      details: zodErrorDetails(parsed.error),
      log: { route: ROUTE, userId: session.user.id },
    });
  }

  const verification = verifySurvivalSessionToken(parsed.data.token);
  if (!verification.valid) {
    return apiError({
      status: 401,
      code: "INVALID_SESSION",
      message: verification.reason,
      log: { route: ROUTE, userId: session.user.id },
    });
  }

  const payload = verification.payload;
  if (payload.uid !== session.user.id) {
    return apiError({
      status: 401,
      code: "SESSION_MISMATCH",
      message: "Session does not belong to this user",
      log: { route: ROUTE, userId: session.user.id },
    });
  }

  const pending = await getCatalogTrackById(payload.pending);
  if (!pending) {
    return apiError({
      status: 410,
      code: "TRACK_GONE",
      message: "The pending track was removed from the catalog",
      log: { route: ROUTE, userId: session.user.id },
    });
  }

  const difficulty = coerceQuizDifficulty(payload.diff);
  const answerMode = coerceQuizAnswerMode(payload.mode);

  const isCorrect =
    !parsed.data.timedOut &&
    parsed.data.answer.trim().length > 0 &&
    isQuizAnswerCorrect(parsed.data.answer, pending.title);

  const nextScore = isCorrect ? payload.score + 1 : payload.score;
  const nextStrikes = isCorrect ? payload.strikes : payload.strikes + 1;
  const gameOver = nextStrikes >= payload.strikesAllowed;

  const reveal = {
    id: pending.id,
    title: pending.title,
    artist: pending.artist,
    album: pending.album,
    cover: pending.cover,
    youtubeVideoId: pending.youtubeVideoId,
  };

  if (gameOver) {
    await db.survivalAttempt.create({
      data: {
        userId: session.user.id,
        score: nextScore,
        difficulty,
        answerMode,
        strikesAllowed: payload.strikesAllowed,
      },
    });

    return NextResponse.json({
      correct: isCorrect,
      reveal,
      score: nextScore,
      strikes: nextStrikes,
      strikesAllowed: payload.strikesAllowed,
      gameOver: true,
    });
  }

  const nextTrack = await pickRandomCatalogTrack(payload.seen);
  if (!nextTrack) {
    // Catalog exhausted — end the run as if all tracks were cleared.
    await db.survivalAttempt.create({
      data: {
        userId: session.user.id,
        score: nextScore,
        difficulty,
        answerMode,
        strikesAllowed: payload.strikesAllowed,
      },
    });

    return NextResponse.json({
      correct: isCorrect,
      reveal,
      score: nextScore,
      strikes: nextStrikes,
      strikesAllowed: payload.strikesAllowed,
      gameOver: true,
      exhausted: true,
    });
  }

  const snippetSeconds = getSnippetDurationSeconds(difficulty);
  const snippetStart = pickSnippetStart(nextTrack.duration, snippetSeconds);
  const nextSeen = [...payload.seen, nextTrack.id];

  const token = createSurvivalSessionToken({
    userId: session.user.id,
    difficulty,
    answerMode,
    score: nextScore,
    strikes: nextStrikes,
    strikesAllowed: payload.strikesAllowed,
    seen: nextSeen,
    pendingId: nextTrack.id,
    pendingStart: snippetStart,
  });

  const options =
    answerMode === "multiple_choice"
      ? shuffleItems([nextTrack.title, ...(await pickDistractorTitles(nextTrack.id, 3))])
      : undefined;

  return NextResponse.json({
    correct: isCorrect,
    reveal,
    score: nextScore,
    strikes: nextStrikes,
    strikesAllowed: payload.strikesAllowed,
    gameOver: false,
    token,
    question: {
      id: nextTrack.id,
      youtubeVideoId: nextTrack.youtubeVideoId,
      duration: nextTrack.duration,
      snippetStart,
      snippetSeconds,
      options,
    },
  });
}
