import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTEXT_WARNING_THRESHOLD,
  DEFAULT_CONTEXT_CRITICAL_THRESHOLD,
  AUTO_COMPACT_THRESHOLD,
  AUTO_COMPACT_WARNING_GAP,
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
