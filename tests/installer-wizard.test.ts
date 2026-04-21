import { describe, it, expect } from 'vitest';
import { runWizard } from '../src/installer-wizard.js';
import { createMockStdin, createMockStdout } from './tui/_mock-stdin.js';

async function flush() { await new Promise((r) => setImmediate(r)); }

describe('runWizard', () => {
  it('three Enters accept defaults: preset=balanced, no theme, icons=nerd', async () => {
    const stdin = createMockStdin(true);
    const stdout = createMockStdout();
    const p = runWizard({ stdin, stdout, current: {} });

    await flush();
    stdin.pressKey('return'); // step 1: balanced (default initial)
    await flush();
    stdin.pressKey('return'); // step 2: (none)
    await flush();
    stdin.pressKey('return'); // step 3: nerd

    const result = await p;
    expect(result).toEqual({ preset: 'balanced', icons: 'nerd' });
    expect('theme' in (result ?? {})).toBe(false);
  });

  it('down+Enter on step 1 picks minimal', async () => {
    const stdin = createMockStdin(true);
    const stdout = createMockStdout();
    const p = runWizard({ stdin, stdout, current: {} });

    await flush();
    stdin.pressKey('down'); stdin.pressKey('return'); // minimal
    await flush();
    stdin.pressKey('return'); // (none)
    await flush();
    stdin.pressKey('return'); // nerd

    expect(await p).toEqual({ preset: 'minimal', icons: 'nerd' });
  });

  it('Esc at step 1 resolves with null', async () => {
    const stdin = createMockStdin(true);
    const stdout = createMockStdout();
    const p = runWizard({ stdin, stdout, current: {} });

    await flush();
    stdin.pressKey('escape');

    expect(await p).toBeNull();
  });

  it('Esc at step 2 resolves with null (step 1 selection not persisted)', async () => {
    const stdin = createMockStdin(true);
    const stdout = createMockStdout();
    const p = runWizard({ stdin, stdout, current: {} });

    await flush();
    stdin.pressKey('return'); // confirm step 1
    await flush();
    stdin.pressKey('escape'); // abort step 2

    expect(await p).toBeNull();
  });

  it('pre-selects values from current config', async () => {
    const stdin = createMockStdin(true);
    const stdout = createMockStdout();
    const p = runWizard({
      stdin, stdout,
      current: { preset: 'full', theme: 'dracula', icons: 'emoji' },
    });

    await flush();
    stdin.pressKey('return'); // accept full
    await flush();
    stdin.pressKey('return'); // accept dracula
    await flush();
    stdin.pressKey('return'); // accept emoji

    expect(await p).toEqual({ preset: 'full', theme: 'dracula', icons: 'emoji' });
  });

  it('selects dracula after down on step 2', async () => {
    const stdin = createMockStdin(true);
    const stdout = createMockStdout();
    const p = runWizard({ stdin, stdout, current: {} });

    await flush();
    stdin.pressKey('return'); // step 1: balanced
    await flush();
    stdin.pressKey('down'); stdin.pressKey('return'); // theme step: from (none) → first real theme (dracula)
    await flush();
    stdin.pressKey('return'); // icons: nerd

    const result = await p;
    expect(result).toEqual({ preset: 'balanced', theme: 'dracula', icons: 'nerd' });
  });
});
