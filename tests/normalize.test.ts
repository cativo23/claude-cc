import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, sanitizeTermString, isQwenInput } from '../src/normalize.js';
import type { ClaudeCodeInput, QwenInput } from '../src/types.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

const claudeInput: ClaudeCodeInput = JSON.parse(
  readFileSync(join(FIXTURES, 'sample-input.json'), 'utf8')
);

const qwenInput: QwenInput = JSON.parse(
  readFileSync(join(FIXTURES, 'qwen-input.json'), 'utf8')
);

const modernInput: ClaudeCodeInput = JSON.parse(
  readFileSync(join(FIXTURES, 'sample-input-modern.json'), 'utf8')
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

    it('extracts window size from Claude (≥ 2.1.x payload)', () => {
      const input = { ...claudeInput, context_window: { ...claudeInput.context_window, context_window_size: 1000000 } };
      expect(normalize(input).context.windowSize).toBe(1000000);
    });

    it('reads effort.level from Claude stdin (≥ 2.1.x)', () => {
      const input = { ...claudeInput, effort: { level: 'high' } };
      expect(normalize(input).effortLevel).toBe('high');
    });

    it('rejects effort.level not in the allowed enum', () => {
      const input = { ...claudeInput, effort: { level: 'EXTREME' } };
      expect(normalize(input).effortLevel).toBeUndefined();
      const input2 = { ...claudeInput, effort: { level: '\x1b[31m' } };
      expect(normalize(input2).effortLevel).toBeUndefined();
    });

    it('sets thinkingEnabled to true when thinking.enabled is true (Claude)', () => {
      const input = { ...claudeInput, thinking: { enabled: true } };
      expect(normalize(input).thinkingEnabled).toBe(true);
    });

    it('does not set thinkingEnabled when thinking.enabled is false', () => {
      const input = { ...claudeInput, thinking: { enabled: false } };
      expect(normalize(input).thinkingEnabled).toBeUndefined();
    });

    it('does not set thinkingEnabled when thinking field is absent', () => {
      expect(normalize(claudeInput).thinkingEnabled).toBeUndefined();
    });

    it('does not set thinkingEnabled for Qwen input', () => {
      const input = { ...qwenInput, thinking: { enabled: true } } as unknown as typeof qwenInput;
      expect(normalize(input).thinkingEnabled).toBeUndefined();
    });

    it('window size is undefined for Claude', () => {
      const result = normalize(claudeInput);
      expect(result.context.windowSize).toBeUndefined();
    });
  });

  describe('realUsedPercentage', () => {
    it('excludes output_tokens from realUsedPercentage to prevent bar jitter', () => {
      // output_tokens should NOT contribute to realUsedPercentage
      // input_tokens: 40000, output_tokens: 10000, cache_read: 5000, cache_creation: 2000
      // Expected: (40000 + 5000 + 2000) / 100000 * 100 = 47 (not 57)
      const input = {
        ...modernInput,
        context_window: {
          ...modernInput.context_window,
          context_window_size: 100000,
          current_usage: {
            input_tokens: 40000,
            output_tokens: 10000,
            cache_read_input_tokens: 5000,
            cache_creation_input_tokens: 2000,
          },
        },
      };
      expect(normalize(input).context.realUsedPercentage).toBeCloseTo(47, 1);
    });

    it('modern payload calculates real percentage from all token categories', () => {
      // output_tokens excluded: (70000 + 10000 + 5000) / 200000 * 100 = 42.5
      expect(normalize(modernInput).context.realUsedPercentage).toBeCloseTo(42.5, 1);
    });

    it('legacy payload without full current_usage shape returns undefined', () => {
      // sample-input.json has current_usage: { output_tokens: 25000 } only
      // and no context_window_size — cannot compute real percentage
      expect(normalize(claudeInput).context.realUsedPercentage).toBeUndefined();
    });

    it('Qwen payload returns undefined', () => {
      expect(normalize(qwenInput).context.realUsedPercentage).toBeUndefined();
    });

    it('modern payload missing context_window_size returns undefined', () => {
      const input = {
        ...modernInput,
        context_window: {
          ...modernInput.context_window,
          context_window_size: undefined as unknown as number,
        },
      };
      expect(normalize(input).context.realUsedPercentage).toBeUndefined();
    });

    it('clamps to 100 when token sum exceeds window size', () => {
      const input = {
        ...modernInput,
        context_window: {
          ...modernInput.context_window,
          context_window_size: 100000,
          current_usage: {
            input_tokens: 80000,
            output_tokens: 30000,
            cache_read_input_tokens: 20000,
            cache_creation_input_tokens: 10000,
          },
        },
      };
      // output_tokens excluded: (80000 + 20000 + 10000) / 100000 * 100 = 110 → clamped to 100
      expect(normalize(input).context.realUsedPercentage).toBe(100);
    });

    it('all zeros in current_usage returns 0', () => {
      const input = {
        ...modernInput,
        context_window: {
          ...modernInput.context_window,
          context_window_size: 200000,
          current_usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      };
      expect(normalize(input).context.realUsedPercentage).toBe(0);
    });
  });

  // Issue #138: Claude auto-compacts at ~80% and Qwen at ~70%, before the bar
  // shows 100%. nearAutoCompact = true within [threshold-gap, threshold) so a
  // dedicated warning glyph can fire ahead of the platform's silent compaction.
  describe('nearAutoCompact', () => {
    // Build a Claude payload with no current_usage so realUsedPercentage is
    // undefined and the effective pct falls back to usedPercentage.
    const claudeAt = (pct: number): ClaudeCodeInput => ({
      ...claudeInput,
      context_window: {
        ...claudeInput.context_window,
        used_percentage: pct,
        // Drop current_usage so realUsedPercentage cannot be computed.
        current_usage: undefined as unknown as ClaudeCodeInput['context_window']['current_usage'],
      },
    });

    const qwenAt = (pct: number): QwenInput => ({
      ...qwenInput,
      context_window: {
        ...qwenInput.context_window,
        used_percentage: pct,
      },
    });

    it('Claude at 79% → true (lower edge of warning window)', () => {
      expect(normalize(claudeAt(79)).context.nearAutoCompact).toBe(true);
    });

    it('Claude at 83% → true (just below auto-compact threshold)', () => {
      expect(normalize(claudeAt(83)).context.nearAutoCompact).toBe(true);
    });

    it('Claude at 84% → false (at threshold, past the warning window)', () => {
      expect(normalize(claudeAt(84)).context.nearAutoCompact).toBe(false);
    });

    it('Claude at 78% → false (below warning window)', () => {
      expect(normalize(claudeAt(78)).context.nearAutoCompact).toBe(false);
    });

    it('Qwen at 65% → true (window starts 5pp earlier for Qwen)', () => {
      expect(normalize(qwenAt(65)).context.nearAutoCompact).toBe(true);
    });

    it('Qwen at 70% → false (at Qwen threshold)', () => {
      expect(normalize(qwenAt(70)).context.nearAutoCompact).toBe(false);
    });

    it('modern Claude payload uses realUsedPercentage to gate the flag', () => {
      // Construct current_usage so the real usage sum is 164000 / 200000 = 82%
      // (output_tokens excluded — only input + cache_read + cache_creation count).
      // used_percentage (hook-provided, input-only) stays at 42% to confirm that
      // the nearAutoCompact flag is driven by realUsedPercentage, not usedPercentage.
      const input: ClaudeCodeInput = {
        ...modernInput,
        context_window: {
          ...modernInput.context_window,
          context_window_size: 200000,
          used_percentage: 42,
          current_usage: {
            input_tokens: 144000,
            output_tokens: 12000,
            cache_read_input_tokens: 15000,
            cache_creation_input_tokens: 5000,
          },
        },
      };
      const result = normalize(input);
      // Sanity: realUsedPercentage = (144000 + 15000 + 5000) / 200000 = 82 (in [80, 85))
      expect(result.context.realUsedPercentage).toBeCloseTo(82, 1);
      expect(result.context.nearAutoCompact).toBe(true);
    });

    it('missing context_window → false (graceful)', () => {
      const input = {
        ...claudeInput,
        context_window: undefined as unknown as ClaudeCodeInput['context_window'],
      };
      expect(normalize(input).context.nearAutoCompact).toBe(false);
    });

    it('nearAutoCompact honors CLAUDE_CODE_AUTO_COMPACT_WINDOW env var', () => {
      // With env var = 60, the warning window is [55, 60).
      // 57% context fill should trigger nearAutoCompact = true.
      vi.stubEnv('CLAUDE_CODE_AUTO_COMPACT_WINDOW', '60');
      const input = claudeAt(57);
      expect(normalize(input).context.nearAutoCompact).toBe(true);

      // Without env var (default threshold = 80), [75, 80).
      // 57% should NOT trigger nearAutoCompact.
      vi.unstubAllEnvs();
      expect(normalize(claudeAt(57)).context.nearAutoCompact).toBe(false);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

describe('sanitizeTermString', () => {
  it('strips C0 control codes (ESC, BEL, etc.)', () => {
    expect(sanitizeTermString('main\x1b[31m-red')).toBe('main[31m-red');
    expect(sanitizeTermString('branch\x07beep')).toBe('branchbeep');
  });
  it('strips C1 control codes (CSI at 0x9b)', () => {
    expect(sanitizeTermString('branch\x9b31mred')).toBe('branch31mred');
  });
  it('strips DEL (0x7f)', () => {
    expect(sanitizeTermString('test\x7fvalue')).toBe('testvalue');
  });
  it('preserves normal text and unicode', () => {
    expect(sanitizeTermString('feat/add-日本語')).toBe('feat/add-日本語');
  });
  it('strips Unicode bidi overrides (RTL spoofing)', () => {
    // U+202E RIGHT-TO-LEFT OVERRIDE — visually flips trailing text
    expect(sanitizeTermString('safe‮malicious')).toBe('safemalicious');
    // U+200B ZERO-WIDTH SPACE
    expect(sanitizeTermString('hi​dden')).toBe('hidden');
    // U+2066 LEFT-TO-RIGHT ISOLATE
    expect(sanitizeTermString('a⁦b⁩c')).toBe('abc');
  });
  it('returns empty string for all-control input', () => {
    expect(sanitizeTermString('\x1b\x9b\x00')).toBe('');
  });
});

describe('normalize sanitizes string fields', () => {
  it('sanitizes gitBranch from Qwen input', () => {
    const malicious = { ...qwenInput, git: { branch: 'main\x1b[?1049h\x1b[31mhacked' } };
    const result = normalize(malicious);
    expect(result.gitBranch).toBe('main[?1049h[31mhacked');
  });
  it('sanitizes model name', () => {
    const malicious = { ...qwenInput, model: { display_name: 'model\x1b[31m' } };
    const result = normalize(malicious);
    expect(result.model).toBe('model[31m');
  });
  it('sanitizes version', () => {
    const malicious = { ...claudeInput, version: '1.0\x1b[31m' };
    const result = normalize(malicious);
    expect(result.version).toBe('1.0[31m');
  });
  it('sanitizes vimMode', () => {
    const malicious = { ...claudeInput, vim: { mode: 'NORMAL\x9b31m' } };
    const result = normalize(malicious);
    expect(result.vimMode).toBe('NORMAL31m');
  });
  it('sanitizes sessionName', () => {
    const malicious = { ...claudeInput, session_name: 'sess\x07beep' };
    const result = normalize(malicious);
    expect(result.sessionName).toBe('sessbeep');
  });
  it('sanitizes outputStyle', () => {
    const malicious = { ...claudeInput, output_style: { name: 'style\x1b[0m' } };
    const result = normalize(malicious);
    expect(result.outputStyle).toBe('style[0m');
  });
  it('sanitizes agentName', () => {
    const malicious = { ...claudeInput, agent: { name: 'agent\x00null' } };
    const result = normalize(malicious);
    expect(result.agentName).toBe('agentnull');
  });
  it('sanitizes worktreeName', () => {
    const malicious = { ...claudeInput, worktree: { name: 'tree\x7f' } };
    const result = normalize(malicious);
    expect(result.worktreeName).toBe('tree');
  });
  it('sanitizes cwd', () => {
    const malicious = { ...claudeInput, cwd: '/tmp/\x1b[31mhacked' };
    const result = normalize(malicious);
    expect(result.cwd).toBe('/tmp/[31mhacked');
  });
  it('sanitizes sessionId', () => {
    const malicious = { ...claudeInput, session_id: 'sess\x07id' };
    const result = normalize(malicious);
    expect(result.sessionId).toBe('sessid');
  });
});

describe('rateLimits normalization', () => {
  it('extracts rate limits from Claude input', () => {
    const result = normalize(claudeInput);
    expect(result.rateLimits).toEqual({
      fiveHour: { usedPercentage: 12.5, resetsAt: undefined },
      sevenDay: { usedPercentage: 3.2, resetsAt: undefined },
    });
  });
  it('rateLimits is undefined for Qwen', () => {
    const result = normalize(qwenInput);
    expect(result.rateLimits).toBeUndefined();
  });
});

describe('cacheHitRate normalization', () => {
  it('returns undefined cacheHitRate for top-level cache_read without current_usage (no denominator after #79)', () => {
    // Top-level cache_read_input_tokens without a current_usage object provides no per-turn
    // denominator since we dropped the legacy total_input fallback in v0.9.1 (#79).
    const input = { ...claudeInput, context_window: { ...claudeInput.context_window, cache_read_input_tokens: 100000, total_input_tokens: 131000 } };
    expect(normalize(input).cacheHitRate).toBeUndefined();
  });
  it('cacheHitRate is undefined when no cache_read_input_tokens', () => {
    expect(normalize(claudeInput).cacheHitRate).toBeUndefined();
  });
  it('cacheHitRate is undefined for Qwen', () => {
    expect(normalize(qwenInput).cacheHitRate).toBeUndefined();
  });
  it('reads cache fields from nested current_usage (modern 2.1.x payload)', () => {
    const input = {
      ...claudeInput,
      context_window: {
        ...claudeInput.context_window,
        current_usage: { input_tokens: 50000, cache_read_input_tokens: 80000, cache_creation_input_tokens: 20000 },
      },
    };
    // 80000 / (50000 + 80000 + 20000) = 53%
    expect(normalize(input).cacheHitRate).toBe(53);
  });
  it('returns undefined cacheHitRate for legacy payloads without current_usage (no denominator)', () => {
    // Pre-2.1.x payload: cache_read at top level, no current_usage object.
    // Without current_usage we cannot compute a per-turn denominator, so cacheHitRate is undefined.
    const input = { ...claudeInput, context_window: { ...claudeInput.context_window, cache_read_input_tokens: 5000000, total_input_tokens: 957000 } };
    expect(normalize(input).cacheHitRate).toBeUndefined();
  });
  it('returns 0 cacheHitRate when cache_read is 0 but denominator is positive (legit no cache hits this turn)', () => {
    const input = {
      ...claudeInput,
      context_window: {
        ...claudeInput.context_window,
        current_usage: { input_tokens: 50000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    };
    expect(normalize(input).cacheHitRate).toBe(0);
  });
  it('returns undefined cacheHitRate when current_usage has no per-turn token fields', () => {
    // current_usage present but only output_tokens — no fresh/read/creation → denominator = 0.
    const input = {
      ...claudeInput,
      context_window: {
        ...claudeInput.context_window,
        current_usage: { output_tokens: 25000 },
        cache_read_input_tokens: 100000,
        total_input_tokens: 131000,
      },
    };
    expect(normalize(input).cacheHitRate).toBeUndefined();
  });
  it('tokens.cached is undefined when payload has top-level cache_read_input_tokens but no current_usage', () => {
    // Verifies the legacy top-level fallback is gone: pre-2.1.x payloads that only expose
    // cache_read_input_tokens at context_window root (no current_usage) must produce
    // tokens.cached === undefined, not a stale numeric value.
    const input = {
      ...claudeInput,
      context_window: {
        ...claudeInput.context_window,
        cache_read_input_tokens: 50000,
        total_input_tokens: 120000,
        // deliberately no current_usage
      },
    };
    expect(normalize(input).tokens.cached).toBeUndefined();
  });
});

describe('normalize — missing context_window', () => {
  it('does not crash when context_window is absent', () => {
    const input = { ...claudeInput, context_window: undefined as any };
    expect(() => normalize(input)).not.toThrow();
  });

  it('returns zero tokens when context_window is absent', () => {
    const input = { ...claudeInput, context_window: undefined as any };
    const result = normalize(input);
    expect(result.tokens.input).toBe(0);
    expect(result.tokens.output).toBe(0);
    expect(result.context.usedPercentage).toBe(0);
  });
});

describe('apiDurationMs normalization', () => {
  it('should_populate_apiDurationMs_from_cost_total_api_duration_ms', () => {
    const input = {
      ...claudeInput,
      cost: { ...claudeInput.cost, total_api_duration_ms: 43800 },
    };
    expect(normalize(input).apiDurationMs).toBe(43800);
  });

  it('should_leave_apiDurationMs_undefined_when_field_absent', () => {
    // claudeInput.cost has no total_api_duration_ms
    expect(normalize(claudeInput).apiDurationMs).toBeUndefined();
  });

  it('should_leave_apiDurationMs_undefined_for_qwen_input', () => {
    expect(normalize(qwenInput).apiDurationMs).toBeUndefined();
  });
});

describe('addedDirsCount normalization (issue #129)', () => {
  const base: ClaudeCodeInput = {
    model: 'Claude',
    session_id: 's',
    context_window: { used_percentage: 10, remaining_percentage: 90 },
    cost: { total_cost_usd: 0, total_duration_ms: 0 },
  };

  it('normalizes count when added_dirs is a non-empty array', () => {
    const input: ClaudeCodeInput = { ...base, workspace: { current_dir: '/tmp', added_dirs: ['/a', '/b', '/c'] } };
    expect(normalize(input).addedDirsCount).toBe(3);
  });

  it('returns undefined when added_dirs is an empty array', () => {
    const input: ClaudeCodeInput = { ...base, workspace: { current_dir: '/tmp', added_dirs: [] } };
    expect(normalize(input).addedDirsCount).toBeUndefined();
  });

  it('returns undefined when added_dirs is missing from workspace', () => {
    const input: ClaudeCodeInput = { ...base, workspace: { current_dir: '/tmp' } };
    expect(normalize(input).addedDirsCount).toBeUndefined();
  });

  it('returns undefined when workspace is absent entirely', () => {
    expect(normalize(base).addedDirsCount).toBeUndefined();
  });
});

describe('workspace.repo normalization', () => {
  const base: ClaudeCodeInput = {
    model: 'Claude',
    session_id: 's',
    context_window: { used_percentage: 10, remaining_percentage: 90 },
    cost: { total_cost_usd: 0, total_duration_ms: 0 },
  };

  it('maps host/owner/name and builds an https url', () => {
    const input: ClaudeCodeInput = { ...base, workspace: { current_dir: '/tmp', repo: { host: 'github.com', owner: 'cativo23', name: 'lumira' } } };
    expect(normalize(input).repo).toEqual({
      host: 'github.com',
      owner: 'cativo23',
      name: 'lumira',
      url: 'https://github.com/cativo23/lumira',
    });
  });

  it('returns undefined when any part is missing', () => {
    const input: ClaudeCodeInput = { ...base, workspace: { current_dir: '/tmp', repo: { host: 'github.com', name: 'lumira' } } };
    expect(normalize(input).repo).toBeUndefined();
  });

  it('drops the repo when a part contains url-breaking characters (security)', () => {
    const input: ClaudeCodeInput = { ...base, workspace: { current_dir: '/tmp', repo: { host: 'github.com', owner: 'a/../evil', name: 'lumira' } } };
    expect(normalize(input).repo).toBeUndefined();
  });

  it('returns undefined when workspace.repo is absent', () => {
    const input: ClaudeCodeInput = { ...base, workspace: { current_dir: '/tmp' } };
    expect(normalize(input).repo).toBeUndefined();
  });
});

describe('worktreeOriginalBranch normalization (issue #130)', () => {
  const base: ClaudeCodeInput = {
    model: 'Claude',
    session_id: 's',
    context_window: { used_percentage: 10, remaining_percentage: 90 },
    cost: { total_cost_usd: 0, total_duration_ms: 0 },
  };

  it('extracts worktreeOriginalBranch when present', () => {
    const input: ClaudeCodeInput = { ...base, worktree: { name: 'feat-wt', original_branch: 'main' } };
    expect(normalize(input).worktreeOriginalBranch).toBe('main');
  });

  it('returns undefined when original_branch is absent', () => {
    const input: ClaudeCodeInput = { ...base, worktree: { name: 'feat-wt' } };
    expect(normalize(input).worktreeOriginalBranch).toBeUndefined();
  });

  it('returns undefined when worktree is absent', () => {
    expect(normalize(base).worktreeOriginalBranch).toBeUndefined();
  });

  it('should_sanitize_original_branch_string_no_control_chars_no_zero_width_unicode', () => {
    // sanitizeTermString strips C0 controls (\x00-\x1f) and zero-width Unicode.
    // ESC (0x1b) is stripped; the remaining ANSI suffix chars are printable ASCII.
    // Zero-width space (U+200B) is stripped.
    const input: ClaudeCodeInput = { ...base, worktree: { name: 'wt', original_branch: 'main​suffix' } };
    const result = normalize(input).worktreeOriginalBranch;
    expect(result).toBe('mainsuffix');
    // ESC itself is stripped
    const input2: ClaudeCodeInput = { ...base, worktree: { name: 'wt', original_branch: 'pre\x1bpost' } };
    const result2 = normalize(input2).worktreeOriginalBranch;
    expect(result2).not.toContain('\x1b');
  });
});

describe('isQwenInput discriminant', () => {
  it('returns true for valid Qwen input', () => {
    expect(isQwenInput(qwenInput)).toBe(true);
  });
  it('returns false for Claude input without metrics', () => {
    expect(isQwenInput(claudeInput)).toBe(false);
  });
  it('returns false for Claude input with metrics.models lacking api', () => {
    const claude = { ...claudeInput, metrics: { models: { 'x': { tokens: 1 } } } };
    expect(isQwenInput(claude as any)).toBe(false);
  });
  it('returns false when metrics.models is empty', () => {
    const claude = { ...claudeInput, metrics: { models: {} } };
    expect(isQwenInput(claude as any)).toBe(false);
  });
});
