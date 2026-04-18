import { describe, expect, it } from "vitest";

import { extractPlaylistId } from "@/lib/youtube-playlist";

describe("extractPlaylistId", () => {
  it("extracts from a music.youtube.com URL", () => {
    expect(
      extractPlaylistId("https://music.youtube.com/playlist?list=PLxxxxxxxxxxx"),
    ).toBe("PLxxxxxxxxxxx");
  });

  it("extracts from a www.youtube.com URL", () => {
    expect(
      extractPlaylistId("https://www.youtube.com/playlist?list=PLabcDEFghiJKL"),
    ).toBe("PLabcDEFghiJKL");
  });

  it("extracts from a URL with additional query params", () => {
    expect(
      extractPlaylistId(
        "https://music.youtube.com/playlist?list=OLAK5uy_abc123DEF456&si=xyz",
      ),
    ).toBe("OLAK5uy_abc123DEF456");
  });

  it("extracts list from a watch URL", () => {
    expect(
      extractPlaylistId(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ",
      ),
    ).toBe("RDdQw4w9WgXcQ");
  });

  it("returns a raw ID unchanged when it looks valid", () => {
    expect(extractPlaylistId("PLabcdefghij123")).toBe("PLabcdefghij123");
    expect(extractPlaylistId("  PLabcdefghij123  ")).toBe("PLabcdefghij123");
  });

  it("returns null for an empty string", () => {
    expect(extractPlaylistId("")).toBeNull();
    expect(extractPlaylistId("   ")).toBeNull();
  });

  it("returns null for input that contains no list= and isn't a plausible ID", () => {
    expect(extractPlaylistId("https://example.com/not-a-playlist")).toBeNull();
    expect(extractPlaylistId("short")).toBeNull();
    expect(extractPlaylistId("has spaces in it here")).toBeNull();
  });

  it("rejects IDs with characters outside the allowed charset", () => {
    expect(extractPlaylistId("PL!!invalid&&chars")).toBeNull();
  });
});
