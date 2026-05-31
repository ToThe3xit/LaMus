// ── Formatowanie czasu ─────────────────────────────────────────

/**
 * Zamienia sekundy na format mm:ss
 * Przykład: 185 → "03:05"
 */
export function formatSeconds(totalSeconds: number): string {
  const safeSecs = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safeSecs / 60);
  const secs = safeSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formatuje postęp odtwarzania jako "mm:ss / mm:ss"
 * Przykład: formatProgress(65, 185) → "01:05 / 03:05"
 */
export function formatProgress(
  positionSeconds: number,
  durationSeconds: number
): string {
  return `${formatSeconds(positionSeconds)} / ${formatSeconds(durationSeconds)}`;
}

/**
 * Oblicza procent postępu jako liczbę 0–100
 */
export function calcProgressPercent(
  positionSeconds: number,
  durationSeconds: number
): number {
  if (durationSeconds <= 0) return 0;
  const clamped = Math.min(positionSeconds, durationSeconds);
  return Math.round((clamped / durationSeconds) * 100);
}