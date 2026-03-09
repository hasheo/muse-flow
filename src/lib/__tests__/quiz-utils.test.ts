import { describe, expect, it } from "vitest";

import { shuffleItems, buildMultipleChoiceOptions, getTimerAnnouncement } from "@/lib/quiz-utils";
import type { Track } from "@/lib/catalog";

function makeTrack(id: string, title: string): Track {
  return {
    id,
    title,
    artist: "Artist",
    album: "Album",
    duration: 180,
    cover: "https://example.com/cover.jpg",
    sourceType: "youtube",
    youtubeVideoId: id,
  };
}

describe("shuffleItems", () => {
  it("returns array of same length", () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffleItems(input)).toHaveLength(5);
  });

  it("contains all original elements", () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffleItems(input).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate the original array", () => {
    const input = [1, 2, 3];
    const copy = [...input];
    shuffleItems(input);
    expect(input).toEqual(copy);
  });

  it("returns empty array for empty input", () => {
    expect(shuffleItems([])).toEqual([]);
  });

  it("returns single-element array unchanged", () => {
    expect(shuffleItems([42])).toEqual([42]);
  });
});

describe("buildMultipleChoiceOptions", () => {
  const tracks = [
    makeTrack("1", "Song A"),
    makeTrack("2", "Song B"),
    makeTrack("3", "Song C"),
    makeTrack("4", "Song D"),
    makeTrack("5", "Song E"),
  ];

  it("returns exactly 4 options", () => {
    expect(buildMultipleChoiceOptions(tracks[0], tracks)).toHaveLength(4);
  });

  it("includes the correct answer", () => {
    const options = buildMultipleChoiceOptions(tracks[0], tracks);
    expect(options).toContain("Song A");
  });

  it("returns no duplicates", () => {
    const options = buildMultipleChoiceOptions(tracks[0], tracks);
    expect(new Set(options).size).toBe(4);
  });

  it("pads with fallback text when pool is too small", () => {
    const smallPool = [makeTrack("1", "Only Song")];
    const options = buildMultipleChoiceOptions(smallPool[0], smallPool);
    expect(options).toHaveLength(4);
    expect(options).toContain("Only Song");
  });
});

describe("getTimerAnnouncement", () => {
  it("announces at 10 seconds", () => {
    expect(getTimerAnnouncement(10)).toBe("10 seconds remaining.");
  });

  it("announces at 5 seconds", () => {
    expect(getTimerAnnouncement(5)).toBe("5 seconds remaining.");
  });

  it("announces at 1 second", () => {
    expect(getTimerAnnouncement(1)).toBe("1 seconds remaining.");
  });

  it("announces timeout at 0", () => {
    expect(getTimerAnnouncement(0)).toBe("Time's up.");
  });

  it("returns empty string for non-announcement values", () => {
    expect(getTimerAnnouncement(15)).toBe("");
    expect(getTimerAnnouncement(7)).toBe("");
  });
});
