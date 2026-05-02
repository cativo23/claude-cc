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
