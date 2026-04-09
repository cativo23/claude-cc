import { describe, it, expect } from 'vitest';
import { main } from '../src/index.js';
import { EMPTY_TRANSCRIPT } from '../src/types.js';
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
      getTermCols: () => 120,
    });
    const plain = stripAnsi(output);
    expect(plain).toContain('Opus 4.6');
    expect(plain).toContain('main');
    expect(plain).toContain('$1.31');
    expect(output.split('\n').length).toBeGreaterThanOrEqual(2);
  });
});
