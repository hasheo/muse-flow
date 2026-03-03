export function normalizeQuizText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isQuizAnswerCorrect(userAnswer: string, correctTitle: string) {
  const rawAnswer = userAnswer.trim();
  const rawTitle = correctTitle.trim();

  if (rawAnswer && rawAnswer === rawTitle) {
    return true;
  }

  const normalizedAnswer = normalizeQuizText(userAnswer);
  const normalizedTitle = normalizeQuizText(correctTitle);

  if (!normalizedAnswer) {
    return false;
  }

  return (
    normalizedAnswer === normalizedTitle ||
    normalizedTitle.includes(normalizedAnswer) ||
    normalizedAnswer.includes(normalizedTitle)
  );
}
