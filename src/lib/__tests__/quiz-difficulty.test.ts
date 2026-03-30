import { describe, expect, it } from "vitest";

import {
  coerceQuizDifficulty,
  getSnippetDurationSeconds,
  getQuizDifficultyLabel,
  pickSnippetStart,
  DEFAULT_QUIZ_DIFFICULTY,
} from "@/lib/quiz-difficulty";

describe("coerceQuizDifficulty", () => {
  it("returns valid difficulty unchanged", () => {
    expect(coerceQuizDifficulty("easy")).toBe("easy");
    expect(coerceQuizDifficulty("hard")).toBe("hard");
    expect(coerceQuizDifficulty("expert")).toBe("expert");
  });

  it("returns default for null/undefined", () => {
    expect(coerceQuizDifficulty(null)).toBe(DEFAULT_QUIZ_DIFFICULTY);
    expect(coerceQuizDifficulty(undefined)).toBe(DEFAULT_QUIZ_DIFFICULTY);
  });

  it("returns default for invalid value", () => {
    expect(coerceQuizDifficulty("impossible")).toBe(DEFAULT_QUIZ_DIFFICULTY);
  });

  it("normalizes case", () => {
    expect(coerceQuizDifficulty("EASY")).toBe("easy");
    expect(coerceQuizDifficulty("Hard")).toBe("hard");
  });
});

describe("getSnippetDurationSeconds", () => {
  it("returns correct durations", () => {
    expect(getSnippetDurationSeconds("easy")).toBe(10);
    expect(getSnippetDurationSeconds("normal")).toBe(5);
    expect(getSnippetDurationSeconds("hard")).toBe(3);
    expect(getSnippetDurationSeconds("expert")).toBe(1);
  });
});

describe("getQuizDifficultyLabel", () => {
  it("returns correct labels", () => {
    expect(getQuizDifficultyLabel("easy")).toBe("Easy");
    expect(getQuizDifficultyLabel("normal")).toBe("Normal");
    expect(getQuizDifficultyLabel("hard")).toBe("Hard");
    expect(getQuizDifficultyLabel("expert")).toBe("Expert");
  });
});

describe("pickSnippetStart", () => {
  it("returns 0 for duration shorter than snippet", () => {
    expect(pickSnippetStart(3, 5)).toBe(0);
  });

  it("returns 0 for zero duration", () => {
    expect(pickSnippetStart(0, 5)).toBe(0);
  });

  it("returns value within valid range", () => {
    for (let i = 0; i < 50; i++) {
      const start = pickSnippetStart(180, 5);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThanOrEqual(175);
    }
  });
});
