/**
 * Lightweight debug logger gated on the `LUMIRA_DEBUG` env var.
 *
 * Statusline stdout must stay clean (Claude Code parses it), so diagnostic
 * output goes to stderr. No-op when `LUMIRA_DEBUG` is unset/empty/"0"/"false",
 * so the branch is effectively free in production.
 *
 * Usage:
 *   const log = debug('transcript');
 *   log('cache hit %s', resolved);   // [lumira:transcript] cache hit /path
 *   log({ lines, durationMs });      // [lumira:transcript] { lines: 420, durationMs: 3 }
 *
 * Enable with:
 *   LUMIRA_DEBUG=1 claude      # or export LUMIRA_DEBUG=1
 */

function debugEnabled(): boolean {
  const v = process.env['LUMIRA_DEBUG'];
  if (!v) return false;
  const lower = v.toLowerCase();
  return lower !== '0' && lower !== 'false' && lower !== '';
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export interface DebugLogger {
  (...args: unknown[]): void;
  /** True when LUMIRA_DEBUG is active — skip expensive formatting branches. */
  readonly enabled: boolean;
}

export function debug(namespace: string): DebugLogger {
  const enabled = debugEnabled();
  const prefix = `[lumira:${namespace}]`;
  const log: DebugLogger = Object.assign(
    (...args: unknown[]) => {
      if (!enabled) return;
      process.stderr.write(`${prefix} ${format(args)}\n`);
    },
    { enabled },
  );
  return log;
}
