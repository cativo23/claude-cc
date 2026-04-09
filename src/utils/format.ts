export function formatTokens(n: number): string {
  if (n == null) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

export function formatDuration(ms: number): string {
  if (ms == null) return '';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function formatCost(usd: number): string {
  if (usd == null) return '';
  if (usd < 0.01) return '$' + usd.toFixed(4);
  return '$' + usd.toFixed(2);
}

export function formatBurnRate(costUsd: number, durationMs: number): string | null {
  if (!costUsd || durationMs <= 60_000) return null;
  const perHour = costUsd / (durationMs / 3_600_000);
  return '$' + perHour.toFixed(2) + '/h';
}
