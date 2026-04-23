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
    },
  },
});
