import { describe, expect, it } from "vitest";

import { normalizeQuizText, isQuizAnswerCorrect } from "@/lib/quiz-text";

describe("normalizeQuizText", () => {
  it("lowercases text", () => {
    expect(normalizeQuizText("Hello World")).toBe("hello world");
  });

  it("removes diacritics", () => {
    expect(normalizeQuizText("café résumé")).toBe("cafe resume");
  });

  it("strips special characters", () => {
    expect(normalizeQuizText("rock & roll (feat. DJ)")).toBe("rock roll feat dj");
  });

  it("collapses whitespace", () => {
    expect(normalizeQuizText("  too   many   spaces  ")).toBe("too many spaces");
  });

  it("handles empty string", () => {
    expect(normalizeQuizText("")).toBe("");
  });
});

describe("isQuizAnswerCorrect", () => {
  it("returns true for exact match", () => {
    expect(isQuizAnswerCorrect("Jazz in Paris", "Jazz in Paris")).toBe(true);
  });

  it("returns true for case-insensitive match", () => {
    expect(isQuizAnswerCorrect("jazz in paris", "Jazz in Paris")).toBe(true);
  });

  it("returns true when answer is substring of title", () => {
    expect(isQuizAnswerCorrect("Jazz in Paris", "Jazz in Paris (feat. Someone)")).toBe(true);
  });

  it("returns true when title is substring of answer", () => {
    expect(isQuizAnswerCorrect("Jazz in Paris Extended Mix", "Jazz in Paris")).toBe(true);
  });

  it("returns false for wrong answer", () => {
    expect(isQuizAnswerCorrect("Bohemian Rhapsody", "Jazz in Paris")).toBe(false);
  });

  it("returns false for empty answer", () => {
    expect(isQuizAnswerCorrect("", "Jazz in Paris")).toBe(false);
  });

  it("returns false for whitespace-only answer", () => {
    expect(isQuizAnswerCorrect("   ", "Jazz in Paris")).toBe(false);
  });

  it("ignores diacritics when matching", () => {
    expect(isQuizAnswerCorrect("cafe resume", "Café Résumé")).toBe(true);
  });
});
