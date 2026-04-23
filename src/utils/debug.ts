/**
 * Lightweight debug logger gated on the `LUMIRA_DEBUG` env var.
 *
 * Statusline stdout must stay clean (Claude Code parses it), so diagnostic
 * output goes to stderr. No-op when `LUMIRA_DEBUG` is unset or set to a
 * denylisted value (`0`, `false`, `no`, `off`, empty), so the branch is
 * effectively free in production.
 *
 * Args are space-joined; objects serialize via `JSON.stringify`. Unserializable
 * values (circular refs, BigInt, getters-that-throw) are annotated as
 * `<unserializable:...>` rather than silently becoming generic `[object Object]`.
 *
 * Usage:
 *   const log = debug('transcript');
 *   log('cache hit:', resolved);     // [lumira:transcript] cache hit: /path
 *   log({ lines, durationMs });      // [lumira:transcript] {"lines":420,"durationMs":3}
 *
 * Enable with:
 *   LUMIRA_DEBUG=1 claude      # or export LUMIRA_DEBUG=1
 */

const FALSY_VALUES = new Set(['', '0', 'false', 'no', 'off']);

function debugEnabled(): boolean {
  const v = process.env['LUMIRA_DEBUG'];
  if (!v) return false;
  return !FALSY_VALUES.has(v.toLowerCase());
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        // Circular refs, BigInt, getter-that-throws, etc. Annotate explicitly
        // so a real bug doesn't silently degrade to generic String coercion.
        return `<unserializable:${String(a)}>`;
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
