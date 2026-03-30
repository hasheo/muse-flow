export function formatDuration(duration: number) {
  const safe = Number.isFinite(duration) ? duration : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}
