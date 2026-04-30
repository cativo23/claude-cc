import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Forked workers required: src/config.ts (qwenWarningShown) and
    // src/tui/select.ts (exitHandlerInstalled) carry module-level flags
    // that rely on per-process isolation. Switching to `pool: 'threads'`
    // would cause parallel tests to share these flags and race. See #20.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Floors set ~3% below current values (lines 90.08, statements 88.76,
      // branches 79.10) so normal churn doesn't fail CI but a meaningful drop
      // does. Raise these as coverage improves; never lower without a PR
      // that justifies it in the description.
      thresholds: {
        lines: 87,
        statements: 85,
        branches: 75,
        functions: 80,
      },
    },
  },
});
