/**
 * Parse an ISO 8601 duration string (e.g. "PT4M13S") into total seconds.
 */
export function parseIsoDuration(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Strip common YouTube video title noise to extract the actual song name.
 * e.g. "Shining Your Song (Official Music Video)" → "Shining Your Song"
 */
export function cleanSongTitle(raw: string): string {
  return (
    raw
      .replace(
        /[\(\[【](?:official\s*(?:music\s*)?(?:video|mv|audio|lyric(?:s)?\s*(?:video)?)|music\s*video|lyric(?:s)?\s*(?:video)?|mv|m\/v|full\s*ver(?:sion)?\.?|short\s*ver(?:sion)?\.?|audio|hd|hq|4k|remaster(?:ed)?|live|pv|animated?\s*(?:mv|video)?|visualizer|clip\s*officiel|video\s*oficial|歌ってみた|踊ってみた)[\)\]】]/gi,
        "",
      )
      .replace(
        /\s+(?:official\s*(?:music\s*)?(?:video|mv|audio)|music\s*video|lyric(?:s)?\s*video|mv|m\/v)\s*$/gi,
        "",
      )
      .replace(/\s*(?:feat\.?|ft\.?)\s+.+$/i, "")
      .trim()
      .replace(/\s*[-–—]\s*$/, "")
      .trim()
  );
}