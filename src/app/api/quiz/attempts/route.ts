import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { enforcePlaylistWriteRateLimit } from "@/lib/api-security";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import { db } from "@/lib/db";
import { QUIZ_ANSWER_MODE_VALUES } from "@/lib/quiz-answer-mode";
import { QUIZ_DIFFICULTY_VALUES } from "@/lib/quiz-difficulty";
import { getQuizTracksHash, verifyQuizSessionToken } from "@/lib/quiz-session";
import { isQuizAnswerCorrect } from "@/lib/quiz-text";

const querySchema = z.object({
  playlistId: z.string().cuid(),
});

const createAttemptSchema = z
  .object({
    playlistId: z.string().cuid(),
    difficulty: z.enum(QUIZ_DIFFICULTY_VALUES),
    answerMode: z.enum(QUIZ_ANSWER_MODE_VALUES),
    quizSessionToken: z.string().min(32).max(4096),
    answers: z
      .array(
        z
          .object({
            trackId: z.string().min(1).max(191),
            userAnswer: z.string().max(256),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

function getUserDisplayName(name: string | null, email: string | null) {
  const normalizedName = name?.trim();
  if (normalizedName) {
    return normalizedName;
  }

  const normalizedEmail = email?.trim();
  if (normalizedEmail) {
    return normalizedEmail.split("@")[0] || normalizedEmail;
  }

  return "Unknown user";
}

async function getAccessiblePlaylist(playlistId: string, userId: string) {
  const playlist = await db.playlist.findFirst({
    where: { id: playlistId },
    select: {
      id: true,
      userId: true,
      isQuiz: true,
      isPublic: true,
    },
  });

  if (!playlist) {
    return null;
  }

  const canAccess = playlist.userId === userId || (playlist.isQuiz && playlist.isPublic);
  if (!canAccess) {
    return null;
  }

  return playlist;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      playlistId: url.searchParams.get("playlistId"),
    });

    if (!parsedQuery.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid query params",
        details: zodErrorDetails(parsedQuery.error),
      });
    }

    const playlist = await getAccessiblePlaylist(parsedQuery.data.playlistId, session.user.id);
    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const attempts = await db.quizAttempt.findMany({
      where: { playlistId: parsedQuery.data.playlistId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ score: "desc" }, { totalQuestions: "desc" }, { createdAt: "asc" }],
    });

    const leaderboard: Array<{
      userId: string;
      userName: string;
      score: number;
      totalQuestions: number;
      difficulty: string;
      answerMode: string;
      createdAt: Date;
    }> = [];
    const seenUsers = new Set<string>();

    for (const attempt of attempts) {
      if (seenUsers.has(attempt.userId)) {
        continue;
      }

      seenUsers.add(attempt.userId);
      leaderboard.push({
        userId: attempt.userId,
        userName: getUserDisplayName(attempt.user.name, attempt.user.email),
        score: attempt.score,
        totalQuestions: attempt.totalQuestions,
        difficulty: attempt.difficulty,
        answerMode: attempt.answerMode,
        createdAt: attempt.createdAt,
      });

      if (leaderboard.length >= 10) {
        break;
      }
    }

    const userHistoryRaw = await db.quizAttempt.findMany({
      where: {
        playlistId: parsedQuery.data.playlistId,
        userId: session.user.id,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      leaderboard,
      userHistory: userHistoryRaw,
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch quiz attempts",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "create-quiz-attempt");
    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError({
        status: 400,
        code: "INVALID_JSON",
        message: "Invalid JSON body",
      });
    }

    const parsed = createAttemptSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid quiz attempt payload",
        details: zodErrorDetails(parsed.error),
      });
    }

    const playlist = await getAccessiblePlaylist(parsed.data.playlistId, session.user.id);
    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    if (!playlist.isQuiz) {
      return apiError({ status: 400, code: "VALIDATION_ERROR", message: "Playlist is not a quiz" });
    }

    const verifiedToken = verifyQuizSessionToken(parsed.data.quizSessionToken);
    if (!verifiedToken.valid) {
      return apiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Invalid quiz session",
        details: { reason: verifiedToken.reason },
      });
    }

    if (verifiedToken.payload.uid !== session.user.id || verifiedToken.payload.pid !== parsed.data.playlistId) {
      return apiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Quiz session does not match user or playlist",
      });
    }

    const playlistTracks = await db.playlistTrack.findMany({
      where: {
        playlistId: parsed.data.playlistId,
        sourceType: "youtube",
        youtubeVideoId: {
          not: null,
        },
      },
      select: {
        trackId: true,
        title: true,
      },
    });

    const expectedTracksHash = getQuizTracksHash(playlistTracks.map((track) => track.trackId));
    if (expectedTracksHash !== verifiedToken.payload.tracksHash) {
      return apiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Quiz session is outdated. Please restart quiz.",
      });
    }

    if (!playlistTracks.length) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Quiz playlist has no tracks",
      });
    }

    if (parsed.data.answers.length !== playlistTracks.length) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid answer count",
      });
    }

    const playlistTrackMap = new Map<string, string>();
    for (const track of playlistTracks) {
      playlistTrackMap.set(track.trackId, track.title);
    }

    const submittedTrackIds = new Set<string>();
    for (const answer of parsed.data.answers) {
      if (submittedTrackIds.has(answer.trackId)) {
        return apiError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Duplicate track answers are not allowed",
        });
      }
      submittedTrackIds.add(answer.trackId);
      if (!playlistTrackMap.has(answer.trackId)) {
        return apiError({
          status: 400,
          code: "VALIDATION_ERROR",
          message: "Answers contain unknown track id",
        });
      }
    }

    if (submittedTrackIds.size !== playlistTrackMap.size) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Answers must include every track exactly once",
      });
    }

    let computedScore = 0;
    for (const answer of parsed.data.answers) {
      const title = playlistTrackMap.get(answer.trackId);
      if (!title) {
        continue;
      }
      if (isQuizAnswerCorrect(answer.userAnswer, title)) {
        computedScore += 1;
      }
    }

    const attempt = await db.quizAttempt.create({
      data: {
        playlistId: parsed.data.playlistId,
        userId: session.user.id,
        score: computedScore,
        totalQuestions: parsed.data.answers.length,
        difficulty: parsed.data.difficulty,
        answerMode: parsed.data.answerMode,
      },
    });

    return NextResponse.json({ attempt }, { status: 201 });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to save quiz attempt",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
