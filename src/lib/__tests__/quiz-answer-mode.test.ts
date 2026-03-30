import { describe, expect, it } from "vitest";

import {
  coerceQuizAnswerMode,
  getQuizAnswerModeLabel,
  DEFAULT_QUIZ_ANSWER_MODE,
} from "@/lib/quiz-answer-mode";

describe("coerceQuizAnswerMode", () => {
  it("returns valid mode unchanged", () => {
    expect(coerceQuizAnswerMode("typed")).toBe("typed");
    expect(coerceQuizAnswerMode("multiple_choice")).toBe("multiple_choice");
  });

  it("returns default for null/undefined", () => {
    expect(coerceQuizAnswerMode(null)).toBe(DEFAULT_QUIZ_ANSWER_MODE);
    expect(coerceQuizAnswerMode(undefined)).toBe(DEFAULT_QUIZ_ANSWER_MODE);
  });

  it("returns default for invalid value", () => {
    expect(coerceQuizAnswerMode("voice")).toBe(DEFAULT_QUIZ_ANSWER_MODE);
  });
});

describe("getQuizAnswerModeLabel", () => {
  it("returns correct labels", () => {
    expect(getQuizAnswerModeLabel("typed")).toBe("Type Answer");
    expect(getQuizAnswerModeLabel("multiple_choice")).toBe("Multiple Choice (4 options)");
  });
});
