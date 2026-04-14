import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderLine2, formatCountdown } from '../../src/render/line2.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput, RenderContext } from '../../src/types.js';
import { NERD_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';

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

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  const input = (overrides.input ?? baseInput);
  return {
    input, normalized: normalize(input), git: EMPTY_GIT, transcript: EMPTY_TRANSCRIPT,
    tokenSpeed: null, memory: null, gsd: null, mcp: null, cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: NERD_ICONS,
    ...overrides,
  };
}

describe('renderLine2', () => {
  it('shows context bar with percentage', () => {
    const out = stripAnsi(renderLine2(makeCtx(), c));
    expect(out).toContain('55%');
  });

  it('shows tokens', () => {
    const out = stripAnsi(renderLine2(makeCtx(), c));
    expect(out).toContain('131k');
    expect(out).toContain('25k');
  });

  it('shows cost', () => {
    const out = stripAnsi(renderLine2(makeCtx(), c));
    expect(out).toContain('$1.31');
  });

  it('shows burn rate when duration > 60s', () => {
    const out = stripAnsi(renderLine2(makeCtx(), c));
    expect(out).toContain('/h');
  });

  it('does not show burn rate when duration <= 60s', () => {
    const input = { ...baseInput, cost: { ...baseInput.cost, total_duration_ms: 30000 } };
    const out = stripAnsi(renderLine2(makeCtx({ input }), c));
    expect(out).not.toContain('/h');
  });

  it('shows token speed when provided', () => {
    const out = stripAnsi(renderLine2(makeCtx({ tokenSpeed: 142 }), c));
    expect(out).toContain('142');
  });

  it('does not show rate limits below 50%', () => {
    const input = { ...baseInput, rate_limits: { five_hour: { used_percentage: 30 } } };
    const out = stripAnsi(renderLine2(makeCtx({ input }), c));
    expect(out).not.toContain('5h');
  });

  it('shows rate limits at >=50%', () => {
    const input = { ...baseInput, rate_limits: { five_hour: { used_percentage: 72 } } };
    const out = stripAnsi(renderLine2(makeCtx({ input }), c));
    expect(out).toContain('72%');
    expect(out).toContain('5h');
  });

  it('shows vim mode', () => {
    const input = { ...baseInput, vim: { mode: 'i' } };
    const out = stripAnsi(renderLine2(makeCtx({ input }), c));
    expect(out).toContain('[i]');
  });

  it('hides effort when medium', () => {
    const out = stripAnsi(renderLine2(makeCtx({ transcript: { ...EMPTY_TRANSCRIPT, thinkingEffort: 'medium' } }), c));
    expect(out).not.toContain('^medium');
  });

  it('shows effort when high', () => {
    const out = stripAnsi(renderLine2(makeCtx({ transcript: { ...EMPTY_TRANSCRIPT, thinkingEffort: 'high' } }), c));
    expect(out).toContain('^high');
  });

  it('shows effort when low', () => {
    const out = stripAnsi(renderLine2(makeCtx({ transcript: { ...EMPTY_TRANSCRIPT, thinkingEffort: 'low' } }), c));
    expect(out).toContain('^low');
  });

  it('shows memory percentage when provided', () => {
    const memory = { usedBytes: 8e9, totalBytes: 16e9, percentage: 50 };
    const out = stripAnsi(renderLine2(makeCtx({ memory }), c));
    expect(out).toContain('50%');
    expect(out).toContain('mem');
  });

  it('shows cache hit rate when cache_read_input_tokens present', () => {
    const input = { ...baseInput, context_window: { ...baseInput.context_window, cache_read_input_tokens: 100000, total_input_tokens: 131000 } };
    const out = stripAnsi(renderLine2(makeCtx({ input }), c));
    expect(out).toContain('cache');
    expect(out).toContain('76%');
  });

  it('hides cache metrics when toggled off', () => {
    const input = { ...baseInput, context_window: { ...baseInput.context_window, cache_read_input_tokens: 100000 } };
    const out = stripAnsi(renderLine2(makeCtx({ input, config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, cacheMetrics: false } } }), c));
    expect(out).not.toContain('cache');
  });

  it('shows MCP server count', () => {
    const mcp = { servers: [{ name: 'a', status: 'ok' as const }, { name: 'b', status: 'ok' as const }] };
    const out = stripAnsi(renderLine2(makeCtx({ mcp }), c));
    expect(out).toContain('MCP 2');
  });

  it('shows MCP errors in red', () => {
    const mcp = { servers: [{ name: 'a', status: 'ok' as const }, { name: 'b', status: 'error' as const }] };
    const out = stripAnsi(renderLine2(makeCtx({ mcp }), c));
    expect(out).toContain('MCP 1/2');
  });

  it('shows contextTokens estimate', () => {
    const input = { ...baseInput, context_window: { ...baseInput.context_window, used_percentage: 50, total_input_tokens: 100000 } };
    const out = stripAnsi(renderLine2(makeCtx({ input }), c));
    expect(out).toContain('100k/200k');
  });
});

describe('formatCountdown', () => {
  afterEach(() => vi.useRealTimers());

  it('returns empty string for past timestamps', () => {
    expect(formatCountdown(Date.now() - 10_000)).toBe('');
  });

  it('formats seconds correctly', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers({ now });
    expect(formatCountdown(now + 45_000)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers({ now });
    expect(formatCountdown(now + 125_000)).toBe('2m05s');
  });

  it('formats hours and minutes', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers({ now });
    expect(formatCountdown(now + 3_725_000)).toBe('1h02m');
  });

  it('treats values < 1e12 as seconds and converts to ms', () => {
    const nowMs = 1_700_000_000_000;
    const nowSec = nowMs / 1000;
    vi.useFakeTimers({ now: nowMs });
    expect(formatCountdown(nowSec + 60)).toBe('1m00s');
  });
});
