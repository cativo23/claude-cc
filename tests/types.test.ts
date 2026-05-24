import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTEXT_WARNING_THRESHOLD,
  DEFAULT_CONTEXT_CRITICAL_THRESHOLD,
  AUTO_COMPACT_THRESHOLD,
  AUTO_COMPACT_WARNING_GAP,
  CUSTOM_COMMAND_MAX_TIMEOUT_MS,
  CUSTOM_COMMAND_MAX_BYTES,
  CUSTOM_COMMAND_MAX_ENV_ENTRIES,
  CUSTOM_COMMAND_MIN_REFRESH_MS,
} from '../src/types.js';

// Issue #138: defaults lowered so the visible bar warns/criticals BEFORE the
// platform's silent auto-compact (Claude ~80%, Qwen ~70%). Old defaults
// (70/85) were higher than Claude's auto-compact, so users never saw the
// red zone before context was compacted.
describe('default context thresholds (issue #138)', () => {
  it('DEFAULT_CONTEXT_WARNING_THRESHOLD === 65', () => {
    expect(DEFAULT_CONTEXT_WARNING_THRESHOLD).toBe(65);
  });

  it('DEFAULT_CONTEXT_CRITICAL_THRESHOLD === 78', () => {
    expect(DEFAULT_CONTEXT_CRITICAL_THRESHOLD).toBe(78);
  });
});

describe('AUTO_COMPACT_THRESHOLD (issue #138)', () => {
  it('Claude Code auto-compacts at 80%', () => {
    expect(AUTO_COMPACT_THRESHOLD['claude-code']).toBe(80);
  });

  it('Qwen Code auto-compacts at 70%', () => {
    expect(AUTO_COMPACT_THRESHOLD['qwen-code']).toBe(70);
  });

  it('AUTO_COMPACT_WARNING_GAP === 5', () => {
    expect(AUTO_COMPACT_WARNING_GAP).toBe(5);
  });
});

// Issue #143: hard caps for the Custom Command widget. These bound runtime
// cost so a misconfigured command can never starve the statusline render.
describe('custom command hard caps (issue #143)', () => {
  it('CUSTOM_COMMAND_MAX_TIMEOUT_MS === 2000', () => {
    expect(CUSTOM_COMMAND_MAX_TIMEOUT_MS).toBe(2000);
  });

  it('CUSTOM_COMMAND_MAX_BYTES === 4096', () => {
    expect(CUSTOM_COMMAND_MAX_BYTES).toBe(4096);
  });

  it('CUSTOM_COMMAND_MAX_ENV_ENTRIES === 32', () => {
    expect(CUSTOM_COMMAND_MAX_ENV_ENTRIES).toBe(32);
  });

  it('CUSTOM_COMMAND_MIN_REFRESH_MS === 500', () => {
    expect(CUSTOM_COMMAND_MIN_REFRESH_MS).toBe(500);
  });
});
