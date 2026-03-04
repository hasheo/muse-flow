import { describe, expect, it } from "vitest";

import { QuizAttemptSaveError } from "@/lib/quiz-types";

describe("QuizAttemptSaveError", () => {
  it("sets message from payload", () => {
    const error = new QuizAttemptSaveError({ message: "Token expired" });
    expect(error.message).toBe("Token expired");
  });

  it("uses default message when payload has none", () => {
    const error = new QuizAttemptSaveError({});
    expect(error.message).toBe("Failed to save quiz attempt.");
  });

  it("sets name to QuizAttemptSaveError", () => {
    const error = new QuizAttemptSaveError({});
    expect(error.name).toBe("QuizAttemptSaveError");
  });

  it("sets code from payload", () => {
    const error = new QuizAttemptSaveError({ code: "TOKEN_EXPIRED" });
    expect(error.code).toBe("TOKEN_EXPIRED");
  });

  it("sets reason from payload details", () => {
    const error = new QuizAttemptSaveError({
      message: "Error",
      details: { reason: "Session expired" },
    });
    expect(error.reason).toBe("Session expired");
  });

  it("is an instance of Error", () => {
    const error = new QuizAttemptSaveError({});
    expect(error).toBeInstanceOf(Error);
  });
});
