export const QUIZ_ANSWER_MODE_VALUES = ["typed", "multiple_choice"] as const;

export type QuizAnswerMode = (typeof QUIZ_ANSWER_MODE_VALUES)[number];

export const QUIZ_ANSWER_MODE_OPTIONS = [
  { value: "typed", label: "Ketik Jawaban" },
  { value: "multiple_choice", label: "Pilihan Ganda (4 opsi)" },
] as const;

export const DEFAULT_QUIZ_ANSWER_MODE: QuizAnswerMode = "typed";
const QUIZ_ANSWER_MODE_SET = new Set<QuizAnswerMode>(QUIZ_ANSWER_MODE_VALUES);

export function coerceQuizAnswerMode(value: string | null | undefined): QuizAnswerMode {
  if (!value) {
    return DEFAULT_QUIZ_ANSWER_MODE;
  }
  const normalized = value.trim().toLowerCase() as QuizAnswerMode;
  if (QUIZ_ANSWER_MODE_SET.has(normalized)) {
    return normalized;
  }
  return DEFAULT_QUIZ_ANSWER_MODE;
}

export function getQuizAnswerModeLabel(mode: QuizAnswerMode) {
  const safeMode = coerceQuizAnswerMode(mode);
  const selected = QUIZ_ANSWER_MODE_OPTIONS.find((option) => option.value === safeMode);
  return selected?.label ?? "Ketik Jawaban";
}
