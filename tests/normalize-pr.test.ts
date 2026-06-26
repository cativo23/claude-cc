import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalize.js';
import type { ClaudeCodeInput, QwenInput } from '../src/types.js';

const baseClaudeInput: ClaudeCodeInput = {
  model: 'Claude Sonnet 4.6',
  session_id: 'test-123',
  context_window: {
    used_percentage: 30,
    remaining_percentage: 70,
    total_input_tokens: 50000,
    total_output_tokens: 5000,
  },
  cost: { total_cost_usd: 0.5, total_duration_ms: 60000 },
  workspace: { current_dir: '/home/user/project' },
};

describe('normalize — PR widget (CC ≥ 2.1.145)', () => {
  it('full payload maps all fields', () => {
    const input: ClaudeCodeInput = {
      ...baseClaudeInput,
      pr: { number: 174, url: 'https://github.com/org/repo/pull/174', review_state: 'approved' },
    };
    const result = normalize(input);
    expect(result.pr).toEqual({ number: 174, url: 'https://github.com/org/repo/pull/174', reviewState: 'approved' });
  });

  it.each([
    { value: 0, label: 'zero' },
    { value: -1, label: 'negative' },
    { value: 1.5, label: 'float' },
    { value: NaN, label: 'NaN' },
    { value: 'abc' as unknown as number, label: 'string' },
  ])('invalid numbers drops pr: $label', ({ value }) => {
    const input: ClaudeCodeInput = { ...baseClaudeInput, pr: { number: value } };
    const result = normalize(input);
    expect(result.pr).toBeUndefined();
  });

  it.each([
    ['javascript:alert(1)'],
    ['http://x.com'],
    ['file:///etc/passwd'],
    ['data:x'],
  ])('bad URL schemes drops url but keeps widget: %s', (badUrl) => {
    const input: ClaudeCodeInput = { ...baseClaudeInput, pr: { number: 1, url: badUrl } };
    const result = normalize(input);
    expect(result.pr?.url).toBeUndefined();
    expect(result.pr?.number).toBe(1);
  });

  it('control chars in url sanitized before scheme check', () => {
    const input: ClaudeCodeInput = {
      ...baseClaudeInput,
      pr: { number: 1, url: 'https://\x1bgithub.com/org/repo/pull/1' },
    };
    const result = normalize(input);
    expect(result.pr?.url).toBe('https://github.com/org/repo/pull/1');
  });

  it('unknown review_state dropped, number+url survive', () => {
    const input: ClaudeCodeInput = {
      ...baseClaudeInput,
      pr: { number: 1, url: 'https://github.com/org/repo/pull/1', review_state: 'merged' },
    };
    const result = normalize(input);
    expect(result.pr?.reviewState).toBeUndefined();
    expect(result.pr?.number).toBe(1);
    expect(result.pr?.url).toBeDefined();
  });

  it('Qwen never gets pr', () => {
    const qwenInput: QwenInput = {
      session_id: 'qwen-test',
      version: '0.14.3',
      model: { display_name: 'qwen-coder' },
      context_window: {
        context_window_size: 128000,
        used_percentage: 20,
        remaining_percentage: 80,
        current_usage: 25600,
        total_input_tokens: 25000,
        total_output_tokens: 600,
      },
      metrics: {
        models: {
          'qwen-coder': {
            api: { total_requests: 5, total_errors: 0, total_latency_ms: 3000 },
            tokens: { prompt: 25000, completion: 600, total: 25600, cached: 0, thoughts: 0 },
          },
        },
        files: { total_lines_added: 10, total_lines_removed: 2 },
      },
      workspace: { current_dir: '/home/user/project' },
    };
    const result = normalize(qwenInput);
    expect(result.pr).toBeUndefined();
  });
});
