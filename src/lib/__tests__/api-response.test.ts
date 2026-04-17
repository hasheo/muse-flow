import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiError } from "@/lib/api-response";

describe("apiError", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("returns the requested status and shape", async () => {
    const response = apiError({
      status: 400,
      code: "BAD_INPUT",
      message: "nope",
      details: { field: "name" },
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toEqual({
      code: "BAD_INPUT",
      message: "nope",
      details: { field: "name" },
    });
  });

  it("does not log 4xx responses without a cause", () => {
    apiError({ status: 400, code: "BAD_INPUT", message: "nope" });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs 4xx responses at warn level when a cause is supplied", () => {
    apiError({
      status: 400,
      code: "BAD_INPUT",
      message: "nope",
      log: { route: "/api/foo", cause: new Error("boom") },
    });

    expect(warnSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(warnSpy.mock.calls[0]?.[0] as string);
    expect(logged.level).toBe("warn");
    expect(logged.route).toBe("/api/foo");
    expect(logged.cause.message).toBe("boom");
  });

  it("logs 5xx responses at error level", () => {
    apiError({
      status: 500,
      code: "INTERNAL",
      message: "ouch",
      log: { route: "/api/bar", userId: "user-1", cause: new Error("db down") },
    });

    expect(errorSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
    expect(logged.level).toBe("error");
    expect(logged.code).toBe("INTERNAL");
    expect(logged.userId).toBe("user-1");
    expect(logged.cause.message).toBe("db down");
  });

  it("omits the details key when not provided", async () => {
    const response = apiError({ status: 404, code: "NOT_FOUND", message: "gone" });
    const payload = await response.json();
    expect(payload).toEqual({ code: "NOT_FOUND", message: "gone" });
    expect("details" in payload).toBe(false);
  });
});
