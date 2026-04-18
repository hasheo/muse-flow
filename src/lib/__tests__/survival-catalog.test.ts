import { describe, expect, it } from "vitest";

import { slugifyCategory } from "@/lib/survival-catalog";

describe("slugifyCategory", () => {
  it("lowercases and dashes the category name", () => {
    expect(slugifyCategory("J-Pop")).toBe("j-pop");
    expect(slugifyCategory("Anime Openings")).toBe("anime-openings");
  });

  it("collapses runs of non-alphanumeric characters into a single dash", () => {
    expect(slugifyCategory("K - Pop !!")).toBe("k-pop");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugifyCategory("--Rock--")).toBe("rock");
    expect(slugifyCategory("  Pop  ")).toBe("pop");
  });

  it("is stable across repeated application (idempotent)", () => {
    const once = slugifyCategory("City Pop / 80s");
    expect(once).toBe("city-pop-80s");
    expect(slugifyCategory(once)).toBe(once);
  });

  it("returns an empty string for an all-punctuation input (caller should treat as absent)", () => {
    expect(slugifyCategory("---")).toBe("");
  });
});
