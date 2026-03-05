import type { Track } from "@/lib/catalog";
import { normalizeQuizText } from "@/lib/quiz-text";

export function shuffleItems<T>(list: T[]) {
  const next = [...list];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

export function shuffleTracks(list: Track[]) {
  return shuffleItems(list);
}

export function buildMultipleChoiceOptions(track: Track, tracksPool: Track[]) {
  const normalizedCorrect = normalizeQuizText(track.title);
  const choices: string[] = [track.title];
  const used = new Set<string>([normalizedCorrect]);

  const distractors = shuffleItems(
    tracksPool.filter((candidate) => normalizeQuizText(candidate.title) !== normalizedCorrect),
  );

  for (const candidate of distractors) {
    if (choices.length >= 4) {
      break;
    }

    const normalizedCandidate = normalizeQuizText(candidate.title);
    if (used.has(normalizedCandidate)) {
      continue;
    }

    used.add(normalizedCandidate);
    choices.push(candidate.title);
  }

  while (choices.length < 4) {
    choices.push(`Pilihan lain ${choices.length}`);
  }

  return shuffleItems(choices);
}

export function getTimerAnnouncement(secondsLeft: number) {
  if (secondsLeft === 10) {
    return "10 detik tersisa.";
  }
  if (secondsLeft <= 5 && secondsLeft >= 1) {
    return `${secondsLeft} detik tersisa.`;
  }
  if (secondsLeft === 0) {
    return "Waktu habis.";
  }
  return "";
}

export const QUIZ_PLAYER_VARS = { autoplay: 0, controls: 0, playsinline: 1, rel: 0 } as const;
