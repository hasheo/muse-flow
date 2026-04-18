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
  const difficulty = coerceQuizDifficulty(payload.diff);
  const answerMode = coerceQuizAnswerMode(payload.mode);

  // Pending track was deleted from the catalog after the token was issued.
  // Rather than ending the run on the admin's schedule, skip this question
  // with no score/strike change and serve a new one.
  if (!pending) {
    const skipTrack = await pickRandomCatalogTrack(payload.seen);
    if (!skipTrack) {
      await db.survivalAttempt.create({
        data: {
          userId: session.user.id,
          score: payload.score,
          difficulty,
          answerMode,
          strikesAllowed: payload.strikesAllowed,
        },
      });
      return NextResponse.json({
        skipped: true,
        score: payload.score,
        strikes: payload.strikes,
        strikesAllowed: payload.strikesAllowed,
        gameOver: true,
        exhausted: true,
      });
    }

    const skipSnippetSeconds = getSnippetDurationSeconds(difficulty);
    const skipSnippetStart = pickSnippetStart(skipTrack.duration, skipSnippetSeconds);
    const skipSeen = [...payload.seen, skipTrack.id];
    const skipToken = createSurvivalSessionToken({
      userId: session.user.id,
      difficulty,
      answerMode,
      score: payload.score,
      strikes: payload.strikes,
      strikesAllowed: payload.strikesAllowed,
      seen: skipSeen,
      pendingId: skipTrack.id,
      pendingStart: skipSnippetStart,
    });
    const skipOptions =
      answerMode === "multiple_choice"
        ? shuffleItems([skipTrack.title, ...(await pickDistractorTitles(skipTrack.id, 3))])
        : undefined;

    return NextResponse.json({
      skipped: true,
      score: payload.score,
      strikes: payload.strikes,
      strikesAllowed: payload.strikesAllowed,
      gameOver: false,
      token: skipToken,
      question: {
        id: skipTrack.id,
        youtubeVideoId: skipTrack.youtubeVideoId,
        duration: skipTrack.duration,
        snippetStart: skipSnippetStart,
        snippetSeconds: skipSnippetSeconds,
        options: skipOptions,
      },
    });
  }

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
