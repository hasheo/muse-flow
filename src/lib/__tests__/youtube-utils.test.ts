import { describe, expect, it } from "vitest";

import { parseIsoDuration, cleanSongTitle } from "@/lib/youtube-utils";

describe("parseIsoDuration", () => {
  it("returns 0 for undefined", () => {
    expect(parseIsoDuration(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseIsoDuration("")).toBe(0);
  });

  it("returns 0 for non-matching format", () => {
    expect(parseIsoDuration("not-a-duration")).toBe(0);
  });

  it("parses seconds only", () => {
    expect(parseIsoDuration("PT30S")).toBe(30);
  });

  it("parses minutes and seconds", () => {
    expect(parseIsoDuration("PT4M13S")).toBe(253);
  });

  it("parses hours, minutes, and seconds", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
  });

  it("parses minutes only", () => {
    expect(parseIsoDuration("PT5M")).toBe(300);
  });

  it("parses hours only", () => {
    expect(parseIsoDuration("PT2H")).toBe(7200);
  });

  it("parses hours and seconds without minutes", () => {
    expect(parseIsoDuration("PT1H30S")).toBe(3630);
  });
});

describe("cleanSongTitle", () => {
  it("removes (Official Music Video)", () => {
    expect(cleanSongTitle("My Song (Official Music Video)")).toBe("My Song");
  });

  it("removes [Official Video]", () => {
    expect(cleanSongTitle("My Song [Official Video]")).toBe("My Song");
  });

  it("removes (MV)", () => {
    expect(cleanSongTitle("My Song (MV)")).toBe("My Song");
  });

  it("removes (Lyrics)", () => {
    expect(cleanSongTitle("My Song (Lyrics)")).toBe("My Song");
  });

  it("removes (Official Audio)", () => {
    expect(cleanSongTitle("My Song (Official Audio)")).toBe("My Song");
  });

  it("removes (Remastered)", () => {
    expect(cleanSongTitle("My Song (Remastered)")).toBe("My Song");
  });

  it("removes (Visualizer)", () => {
    expect(cleanSongTitle("My Song (Visualizer)")).toBe("My Song");
  });

  it("removes feat. suffix", () => {
    expect(cleanSongTitle("My Song feat. Another Artist")).toBe("My Song");
  });

  it("removes ft. suffix", () => {
    expect(cleanSongTitle("My Song ft. Another Artist")).toBe("My Song");
  });

  it("removes trailing unbracketed Official Music Video", () => {
    expect(cleanSongTitle("My Song Official Music Video")).toBe("My Song");
  });

  it("preserves clean titles", () => {
    expect(cleanSongTitle("Just a Normal Title")).toBe("Just a Normal Title");
  });

  it("removes trailing dash after bracket removal", () => {
    expect(cleanSongTitle("Artist - (Official Video)")).toBe("Artist");
  });

  it("is case-insensitive for tag removal", () => {
    expect(cleanSongTitle("My Song (OFFICIAL VIDEO)")).toBe("My Song");
  });
});
