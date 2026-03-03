import type { QuizDifficulty } from "@/lib/quiz-difficulty";
import type { QuizAnswerMode } from "@/lib/quiz-answer-mode";
import type { Track } from "@/lib/catalog";

export type PlaylistDetailResponse = {
  playlist?: {
    id: string;
    name: string;
    cover: string;
    isQuiz: boolean;
    isPublic: boolean;
    difficulty: QuizDifficulty;
    answerMode: QuizAnswerMode;
    ownerName?: string;
    trackCount: number;
  };
  tracks?: Track[];
  quizSessionToken?: string | null;
  message?: string;
};

export type QuizToast = { message: string; type: "error" | "success" } | null;

export type QuestionReview = {
  trackId: string;
  questionNumber: number;
  correctAnswer: string;
  userAnswer: string;
  isCorrect: boolean;
};

export type QuizAttemptAnswer = {
  trackId: string;
  userAnswer: string;
};

export type QuizAttemptItem = {
  id: string;
  userId: string;
  userName?: string;
  score: number;
  totalQuestions: number;
  difficulty: string;
  answerMode: string;
  createdAt: string;
};

export type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: {
    reason?: string;
  };
};

export class QuizAttemptSaveError extends Error {
  code?: string;
  reason?: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.message || "Failed to save quiz attempt.");
    this.name = "QuizAttemptSaveError";
    this.code = payload.code;
    this.reason = payload.details?.reason;
  }
}
