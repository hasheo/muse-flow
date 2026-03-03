export const QUIZ_DIFFICULTY_VALUES = ["easy", "normal", "hard", "expert"] as const;

export type QuizDifficulty = (typeof QUIZ_DIFFICULTY_VALUES)[number];

export const QUIZ_DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", snippetSeconds: 10 },
  { value: "normal", label: "Normal", snippetSeconds: 5 },
  { value: "hard", label: "Hard", snippetSeconds: 3 },
  { value: "expert", label: "Expert", snippetSeconds: 1 },
] as const;

export const DEFAULT_QUIZ_DIFFICULTY: QuizDifficulty = "normal";
const QUIZ_DIFFICULTY_SET = new Set<QuizDifficulty>(QUIZ_DIFFICULTY_VALUES);

export function coerceQuizDifficulty(value: string | null | undefined): QuizDifficulty {
  if (!value) {
    return DEFAULT_QUIZ_DIFFICULTY;
  }
  const normalized = value.trim().toLowerCase() as QuizDifficulty;
  if (QUIZ_DIFFICULTY_SET.has(normalized)) {
    return normalized;
  }
  return DEFAULT_QUIZ_DIFFICULTY;
}

function randomInt(min: number, max: number) {
  if (max <= min) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getSnippetDurationSeconds(difficulty: QuizDifficulty) {
  const safeDifficulty = coerceQuizDifficulty(difficulty);
  const selected = QUIZ_DIFFICULTY_OPTIONS.find((option) => option.value === safeDifficulty);
  return selected?.snippetSeconds ?? 5;
}

export function getQuizDifficultyLabel(difficulty: QuizDifficulty) {
  const safeDifficulty = coerceQuizDifficulty(difficulty);
  const selected = QUIZ_DIFFICULTY_OPTIONS.find((option) => option.value === safeDifficulty);
  return selected?.label ?? "Normal";
}

export function pickSnippetStart(duration: number, snippetSeconds: number) {
  const safeDuration = Math.max(0, Math.floor(duration));
  const maxStart = Math.max(0, safeDuration - snippetSeconds);
  if (!maxStart) {
    return 0;
  }

  const pickEarly = Math.random() < 0.5;
  if (pickEarly) {
    const earlyMax = Math.min(maxStart, Math.max(3, Math.floor(safeDuration * 0.2)));
    return randomInt(0, earlyMax);
  }

  const midMin = Math.min(maxStart, Math.floor(safeDuration * 0.4));
  const midMax = Math.max(midMin, Math.min(maxStart, Math.floor(safeDuration * 0.7)));
  return randomInt(midMin, midMax);
}
