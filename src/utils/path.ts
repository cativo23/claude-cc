import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { resolve, relative, isAbsolute } from 'node:path';

/**
 * Returns true if `candidate` is the same as, or a descendant of, any of the
 * `roots`. Uses `path.relative` to avoid the classic `startsWith` bypass where
 * a sibling like `/tmpattacker` would pass `'/tmp'.startsWith()`.
 *
 * Both `candidate` and each entry in `roots` are normalized via `path.resolve`
 * internally, so callers don't have to pre-resolve.
 *
 * IMPORTANT: this performs string-level path comparison only. It does **not**
 * follow symlinks. Callers protecting against symlink-based traversal should
 * pass paths that have already been canonicalized via `fs.realpathSync`.
 *
 * Empty-string entries in `roots` are skipped (otherwise `resolve('')` would
 * silently expand to `process.cwd()` and widen the allowlist).
 */
/**
 * Resolves a path through symlinks, falling back to plain `resolve()` if the
 * path doesn't exist or canonicalisation fails. Used to harden allow-list
 * checks across modules that read user-controlled paths.
 */
export function realpathSafe(p: string): string {
  try { return realpathSync(p); } catch { return resolve(p); }
}

/**
 * The default set of root directories Lumira parsers are allowed to read from.
 * Includes both the canonical and the symlink-resolved forms of $HOME and
 * $TMPDIR so paths under either spelling are accepted.
 *
 * IMPORTANT: this allow-list is a *string-level* defence. `isUnderAllowedRoot`
 * does not follow symlinks at check time — callers protecting against symlink
 * traversal should canonicalise the candidate path with `realpathSafe` before
 * the comparison, or accept that a symlink whose target lies outside the
 * allow-list is treated as legal as long as its own *path* sits under one.
 */
export const LUMIRA_ALLOWED_ROOTS: readonly string[] = [
  ...new Set([resolve(homedir()), resolve(tmpdir()), realpathSafe(homedir()), realpathSafe(tmpdir())]),
];

export function isUnderAllowedRoot(candidate: string, roots: readonly string[]): boolean {
  if (roots.length === 0) return false;
  const normalizedCandidate = resolve(candidate);
  for (const root of roots) {
    if (!root) continue;
    const normalizedRoot = resolve(root);
    if (normalizedCandidate === normalizedRoot) return true;
    const rel = relative(normalizedRoot, normalizedCandidate);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return true;
  }
  return false;
}
