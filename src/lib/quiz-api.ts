import type { QuizDifficulty } from "@/lib/quiz-difficulty";
import type { QuizAnswerMode } from "@/lib/quiz-answer-mode";
import {
  type PlaylistDetailResponse,
  type QuizAttemptAnswer,
  type QuizAttemptItem,
  type ApiErrorPayload,
  QuizAttemptSaveError,
} from "@/lib/quiz-types";

export async function fetchPlaylistTracks(playlistId: string) {
  const response = await fetch(`/api/playlists/${playlistId}`, { cache: "no-store" });
  const payload = (await response.json()) as PlaylistDetailResponse;

  if (!response.ok) {
    throw new Error(payload.message || "Failed to load playlist tracks");
  }

  return payload;
}

export async function saveQuizAttempt(payload: {
  playlistId: string;
  difficulty: QuizDifficulty;
  answerMode: QuizAnswerMode;
  quizSessionToken: string;
  answers: QuizAttemptAnswer[];
}) {
  const response = await fetch("/api/quiz/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const parsed = (await response.json()) as ApiErrorPayload;
  if (!response.ok) {
    throw new QuizAttemptSaveError(parsed);
  }
}

export function isTokenExpiredError(error: unknown) {
  return error instanceof QuizAttemptSaveError && error.code === "UNAUTHORIZED" && error.reason === "Token expired";
}

export async function fetchQuizAttempts(playlistId: string) {
  const response = await fetch(`/api/quiz/attempts?playlistId=${encodeURIComponent(playlistId)}`, {
    cache: "no-store",
  });
  const parsed = (await response.json()) as {
    leaderboard?: QuizAttemptItem[];
    userHistory?: QuizAttemptItem[];
    message?: string;
  };
  if (!response.ok) {
    throw new Error(parsed.message || "Failed to load quiz attempts.");
  }
  return {
    leaderboard: parsed.leaderboard ?? [],
    userHistory: parsed.userHistory ?? [],
  };
}
