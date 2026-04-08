import { describe, it, expect } from 'vitest';
import { renderLine2 } from '../../src/render/line2.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput } from '../../src/types.js';

const c = createColors('named');

const baseInput: ClaudeCodeInput = {
  model: 'Claude Opus 4',
  session_id: 'test-123',
  context_window: {
    used_percentage: 55,
    remaining_percentage: 45,
    total_input_tokens: 131000,
    total_output_tokens: 25000,
  },
  cost: { total_cost_usd: 1.31, total_duration_ms: 2106000 },
  workspace: { current_dir: '/home/user/project' },
};

describe('renderLine2', () => {
  it('shows context bar with percentage', () => {
    const out = stripAnsi(renderLine2(baseInput, null, '', c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('55%');
  });

  it('shows tokens', () => {
    const out = stripAnsi(renderLine2(baseInput, null, '', c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('131k');
    expect(out).toContain('25k');
  });

  it('shows cost', () => {
    const out = stripAnsi(renderLine2(baseInput, null, '', c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('$1.31');
  });

  it('shows burn rate when duration > 60s', () => {
    const out = stripAnsi(renderLine2(baseInput, null, '', c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('/h');
  });

  it('does not show burn rate when duration <= 60s', () => {
    const input = { ...baseInput, cost: { ...baseInput.cost, total_duration_ms: 30000 } };
    const out = stripAnsi(renderLine2(input, null, '', c, DEFAULT_DISPLAY, 120));
    expect(out).not.toContain('/h');
  });

  it('shows token speed when provided', () => {
    const out = stripAnsi(renderLine2(baseInput, 142, '', c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('142');
  });

  it('does not show rate limits below 50%', () => {
    const input = { ...baseInput, rate_limits: { five_hour: { used_percentage: 30 } } };
    const out = stripAnsi(renderLine2(input, null, '', c, DEFAULT_DISPLAY, 120));
    expect(out).not.toContain('5h');
  });

  it('shows rate limits at >=50%', () => {
    const input = { ...baseInput, rate_limits: { five_hour: { used_percentage: 72 } } };
    const out = stripAnsi(renderLine2(input, null, '', c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('72%');
    expect(out).toContain('5h');
  });

  it('shows vim mode', () => {
    const input = { ...baseInput, vim: { mode: 'i' } };
    const out = stripAnsi(renderLine2(input, null, '', c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('[i]');
  });

  it('hides effort when medium', () => {
    const out = stripAnsi(renderLine2(baseInput, null, 'medium', c, DEFAULT_DISPLAY, 120));
    expect(out).not.toContain('^medium');
  });

  it('shows effort when high', () => {
    const out = stripAnsi(renderLine2(baseInput, null, 'high', c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('^high');
  });

  it('shows effort when low', () => {
    const out = stripAnsi(renderLine2(baseInput, null, 'low', c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('^low');
  });
});
