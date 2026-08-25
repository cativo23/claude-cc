/**
 * Every statusline segment renders on one line — collapse any line-breaking
 * whitespace (`\r`, `\n`, and the less common `\v`/`\f`, which xterm/VTE also
 * treat as a line feed) to spaces, then trim the ends. Applied both where a
 * Custom Command's stdout is cached (custom-refresh.ts) and where it's
 * rendered (render/shared.ts) — write-side keeps new entries clean, read-side
 * means an entry cached before this existed doesn't stay visibly broken
 * until its next refresh (up to 24h away on a long refreshMs).
 */
export function toSingleLine(s: string): string {
  return s.replace(/[\r\n\v\f]+/g, ' ').trim();
}

export function formatTokens(n: number): string {
  if (n == null || !Number.isFinite(n)) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

export function formatDuration(ms: number): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function formatCost(usd: number): string {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return '';
  if (usd < 0.01) return '$' + usd.toFixed(4);
  return '$' + usd.toFixed(2);
}

export function formatBurnRate(costUsd: number, durationMs: number): string | null {
  if (!Number.isFinite(costUsd) || !Number.isFinite(durationMs) || costUsd <= 0 || durationMs <= 60_000) return null;
  const perHour = costUsd / (durationMs / 3_600_000);
  return '$' + perHour.toFixed(2) + '/h';
}
