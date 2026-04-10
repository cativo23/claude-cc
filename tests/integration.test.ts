import { describe, it, expect } from 'vitest';
import { main } from '../src/index.js';
import { EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../src/types.js';
import { stripAnsi } from '../src/render/colors.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('main', () => {
  it('produces multi-line output', async () => {
    const sample = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'sample-input.json'), 'utf8'));
    const output = await main({
      readStdin: async () => sample,
      parseGit: async () => ({ branch: 'main', staged: 0, modified: 1, untracked: 0 }),
      parseTranscript: async () => EMPTY_TRANSCRIPT,
      getTokenSpeed: () => 142,
      getMemoryInfo: () => ({ usedBytes: 8e9, totalBytes: 16e9, percentage: 50 }),
      getGsdInfo: () => null,
      getMcpInfo: () => null,
      getTermCols: () => 120,
    });
    const plain = stripAnsi(output);
    expect(plain).toContain('Opus 4.6');
    expect(plain).toContain('main');
    expect(plain).toContain('$1.31');
    expect(output.split('\n').length).toBeGreaterThanOrEqual(2);
  });

  it('uses injected loadConfig for minimal layout', async () => {
    const sample = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'sample-input.json'), 'utf8'));
    const output = await main({
      readStdin: async () => sample,
      parseGit: async () => ({ branch: 'main', staged: 0, modified: 0, untracked: 0 }),
      parseTranscript: async () => EMPTY_TRANSCRIPT,
      getTokenSpeed: () => null,
      getMemoryInfo: () => null,
      getGsdInfo: () => null,
      getMcpInfo: () => null,
      getTermCols: () => 120,
      loadConfig: () => ({ ...DEFAULT_CONFIG, layout: 'singleline', display: { ...DEFAULT_DISPLAY } }),
    });
    // Minimal layout produces at most 2 lines (main + optional tools/todos)
    expect(output.split('\n').length).toBeLessThanOrEqual(2);
  });

  it('includes GSD info when enabled', async () => {
    const sample = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'sample-input.json'), 'utf8'));
    const output = await main({
      readStdin: async () => sample,
      parseGit: async () => ({ branch: 'main', staged: 0, modified: 0, untracked: 0 }),
      parseTranscript: async () => EMPTY_TRANSCRIPT,
      getTokenSpeed: () => null,
      getMemoryInfo: () => null,
      getGsdInfo: () => ({ currentTask: 'Building feature', updateAvailable: false }),
      getMcpInfo: () => null,
      getTermCols: () => 120,
      loadConfig: () => ({ ...DEFAULT_CONFIG, gsd: true, display: { ...DEFAULT_DISPLAY } }),
    });
    const plain = stripAnsi(output);
    expect(plain).toContain('Building feature');
  });

  it('auto-switches to minimal at narrow cols', async () => {
    const sample = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'sample-input.json'), 'utf8'));
    const output = await main({
      readStdin: async () => sample,
      parseGit: async () => ({ branch: 'main', staged: 0, modified: 0, untracked: 0 }),
      parseTranscript: async () => EMPTY_TRANSCRIPT,
      getTokenSpeed: () => null,
      getMemoryInfo: () => null,
      getGsdInfo: () => null,
      getMcpInfo: () => null,
      getTermCols: () => 60,
    });
    // auto layout at <70 cols should produce at most 2 lines
    expect(output.split('\n').length).toBeLessThanOrEqual(2);
  });

  it('falls back to workspace dir when cwd is missing', async () => {
    const sample = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'sample-input.json'), 'utf8'));
    delete sample.cwd;
    const output = await main({
      readStdin: async () => sample,
      parseGit: async () => ({ branch: 'main', staged: 0, modified: 0, untracked: 0 }),
      parseTranscript: async () => EMPTY_TRANSCRIPT,
      getTokenSpeed: () => null,
      getMemoryInfo: () => null,
      getGsdInfo: () => null,
      getMcpInfo: () => null,
      getTermCols: () => 120,
    });
    expect(output.length).toBeGreaterThan(0);
  });
});
