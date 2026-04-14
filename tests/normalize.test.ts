import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from '../src/normalize.js';
import type { ClaudeCodeInput, QwenInput } from '../src/types.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

const claudeInput: ClaudeCodeInput = JSON.parse(
  readFileSync(join(FIXTURES, 'sample-input.json'), 'utf8')
);

const qwenInput: QwenInput = JSON.parse(
  readFileSync(join(FIXTURES, 'qwen-input.json'), 'utf8')
);

describe('normalize', () => {
  describe('platform detection', () => {
    it('detects Claude Code input', () => {
      const result = normalize(claudeInput);
      expect(result.platform).toBe('claude-code');
    });

    it('detects Qwen Code input', () => {
      const result = normalize(qwenInput);
      expect(result.platform).toBe('qwen-code');
    });
  });

  describe('common fields', () => {
    it('extracts model name from Claude input', () => {
      const result = normalize(claudeInput);
      expect(result.model).toBe('Opus 4.6 (1M context)');
    });

    it('extracts model name from Qwen input', () => {
      const result = normalize(qwenInput);
      expect(result.model).toBe('coder-model');
    });

    it('extracts session ID from both', () => {
      expect(normalize(claudeInput).sessionId).toBe('test-session-123');
      expect(normalize(qwenInput).sessionId).toBe('test-qwen-session');
    });

    it('extracts version', () => {
      const result = normalize(qwenInput);
      expect(result.version).toBe('0.14.3');
    });

    it('extracts cwd from both', () => {
      const claude = normalize(claudeInput);
      expect(claude.cwd).toBe('/home/user/project');

      const qwen = normalize(qwenInput);
      expect(qwen.cwd).toBe('/tmp/test-workspace');
    });
  });

  describe('token unification', () => {
    it('unifies input/output tokens from Claude', () => {
      const result = normalize(claudeInput);
      expect(result.tokens.input).toBe(131000);
      expect(result.tokens.output).toBe(25000);
    });

    it('unifies input/output tokens from Qwen', () => {
      const result = normalize(qwenInput);
      expect(result.tokens.input).toBe(55915);
      expect(result.tokens.output).toBe(595);
    });

    it('extracts cached tokens from Claude', () => {
      const result = normalize(claudeInput);
      expect(result.tokens.cached).toBeUndefined();
    });

    it('extracts cached tokens from Qwen', () => {
      const result = normalize(qwenInput);
      expect(result.tokens.cached).toBe(35889);
    });

    it('extracts thoughts from Qwen', () => {
      const result = normalize(qwenInput);
      expect(result.tokens.thoughts).toBe(69);
    });

    it('thoughts is undefined for Claude', () => {
      const result = normalize(claudeInput);
      expect(result.tokens.thoughts).toBeUndefined();
    });
  });

  describe('context window', () => {
    it('extracts used percentage from both', () => {
      expect(normalize(claudeInput).context.usedPercentage).toBe(5.2);
      expect(normalize(qwenInput).context.usedPercentage).toBe(2);
    });

    it('extracts window size from Qwen', () => {
      const result = normalize(qwenInput);
      expect(result.context.windowSize).toBe(1000000);
    });

    it('window size is undefined for Claude', () => {
      const result = normalize(claudeInput);
      expect(result.context.windowSize).toBeUndefined();
    });
  });

  describe('cost and duration (Claude only)', () => {
    it('extracts cost from Claude', () => {
      const result = normalize(claudeInput);
      expect(result.cost).toBe(1.31);
    });

    it('cost is undefined for Qwen', () => {
      const result = normalize(qwenInput);
      expect(result.cost).toBeUndefined();
    });

    it('extracts duration from Claude', () => {
      const result = normalize(claudeInput);
      expect(result.durationMs).toBe(2106000);
    });

    it('duration is undefined for Qwen', () => {
      const result = normalize(qwenInput);
      expect(result.durationMs).toBeUndefined();
    });
  });

  describe('performance metrics (Qwen only)', () => {
    it('extracts API metrics from Qwen', () => {
      const result = normalize(qwenInput);
      expect(result.performance).toEqual({
        requests: 3,
        errors: 0,
        latencyMs: 22770,
      });
    });

    it('performance is undefined for Claude', () => {
      const result = normalize(claudeInput);
      expect(result.performance).toBeUndefined();
    });
  });

  describe('git branch', () => {
    it('extracts branch from Qwen native git', () => {
      const result = normalize(qwenInput);
      expect(result.gitBranch).toBe('main');
    });

    it('gitBranch is undefined when Qwen does not send it', () => {
      const noGit = { ...qwenInput };
      delete (noGit as Record<string, unknown>).git;
      const result = normalize(noGit );
      expect(result.gitBranch).toBeUndefined();
    });
  });

  describe('file changes', () => {
    it('extracts lines changed from Qwen metrics', () => {
      const result = normalize(qwenInput);
      expect(result.linesAdded).toBe(120);
      expect(result.linesRemoved).toBe(30);
    });

    it('extracts lines changed from Claude cost', () => {
      const result = normalize(claudeInput);
      expect(result.linesAdded).toBe(150);
      expect(result.linesRemoved).toBe(30);
    });

    it('defaults to 0 when not present', () => {
      const noMetrics = { ...qwenInput };
      delete (noMetrics.metrics as Record<string, unknown>).files;
      const result = normalize(noMetrics );
      expect(result.linesAdded).toBe(0);
      expect(result.linesRemoved).toBe(0);
    });
  });

  describe('vim mode', () => {
    it('extracts vim mode when present', () => {
      const withVim = { ...claudeInput, vim: { mode: 'NORMAL' } };
      const result = normalize(withVim);
      expect(result.vimMode).toBe('NORMAL');
    });

    it('vimMode is undefined when not present', () => {
      expect(normalize(claudeInput).vimMode).toBeUndefined();
      expect(normalize(qwenInput).vimMode).toBeUndefined();
    });
  });

  describe('raw escape hatch', () => {
    it('preserves original Claude input', () => {
      const result = normalize(claudeInput);
      expect(result.raw).toBe(claudeInput);
      expect((result.raw as ClaudeCodeInput).cost.total_cost_usd).toBe(1.31);
    });

    it('preserves original Qwen input', () => {
      const result = normalize(qwenInput);
      expect(result.raw).toBe(qwenInput);
    });
  });
});

describe('empty model metrics', () => {
  it('handles Qwen input with empty models object', () => {
    const input = { ...qwenInput, metrics: { models: {}, files: { total_lines_added: 0, total_lines_removed: 0 } } };
    const result = normalize(input );
    expect(result.performance).toBeUndefined();
    expect(result.tokens.cached).toBeUndefined();
    expect(result.tokens.thoughts).toBeUndefined();
  });
});
