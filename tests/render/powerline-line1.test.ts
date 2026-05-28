import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderPowerlineLine1 } from '../../src/render/powerline-line1.js';
import { stripAnsi } from '../../src/render/colors.js';
import { resolveIcons } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';
import { DEFAULT_CONFIG, DEFAULT_DISPLAY, EMPTY_GIT, EMPTY_TRANSCRIPT } from '../../src/types.js';
import type { RenderContext, GitStatus } from '../../src/types.js';
import { _setHyperlinkSupport } from '../../src/render/hyperlink.js';

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  const rawInput = {
    model: 'Claude Sonnet 4.6',
    session_id: 'test',
    context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
    cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
  };
  return {
    input: normalize(rawInput),
    git: { ...EMPTY_GIT },
    transcript: { ...EMPTY_TRANSCRIPT },
    tokenSpeed: null,
    memory: null,
    gsd: null,
    mcp: null,
    cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: resolveIcons('nerd'),
    ...overrides,
  };
}

describe('renderPowerlineLine1', () => {
  // ── Hyperlink isolation ─────────────────────────────────────────────
  // Disable OSC 8 sequences so assertions don't have to strip link wrappers.
  beforeEach(() => _setHyperlinkSupport(false));
  afterEach(() => _setHyperlinkSupport(null));

  // ── Model segment ───────────────────────────────────────────────────

  describe('model segment', () => {
    it('renders model name in output', () => {
      const ctx = makeCtx();
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('Claude Sonnet 4.6');
    });

    it('omits model segment when display.model is false', () => {
      const ctx = makeCtx({
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, model: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('Claude Sonnet 4.6');
    });

    it('returns empty string when model is absent and all other toggles are off', () => {
      const rawInput = {
        model: '',
        session_id: 'test',
        context_window: { used_percentage: 0, remaining_percentage: 100 },
        cost: { total_cost_usd: 0, total_duration_ms: 0 },
      };
      const ctx = makeCtx({
        input: normalize(rawInput),
        config: {
          ...DEFAULT_CONFIG,
          display: {
            ...DEFAULT_DISPLAY,
            model: true,
            branch: false,
            directory: false,
            version: false,
            duration: false,
            memory: false,
            tokenSpeed: false,
          },
        },
      });
      const out = renderPowerlineLine1(ctx, 'truecolor', null);
      expect(out).toBe('');
    });
  });

  // ── Branch segment ──────────────────────────────────────────────────

  describe('branch segment', () => {
    it('renders branch name from git status', () => {
      const ctx = makeCtx({
        git: { ...EMPTY_GIT, branch: 'main' },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('main');
    });

    it('renders branch name from input.gitBranch when git.branch is empty', () => {
      const rawInput = {
        model: 'Claude',
        session_id: 'test',
        context_window: { used_percentage: 10, remaining_percentage: 90 },
        cost: { total_cost_usd: 0, total_duration_ms: 0 },
        git: { branch: 'feature/from-input' },
      } as unknown as Parameters<typeof normalize>[0];
      const ctx = makeCtx({
        input: { ...normalize(rawInput as Parameters<typeof normalize>[0]), gitBranch: 'feature/from-input' },
        git: { ...EMPTY_GIT },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('feature/from-input');
    });

    it('omits branch segment when display.branch is false', () => {
      const ctx = makeCtx({
        git: { ...EMPTY_GIT, branch: 'main' },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, branch: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('main');
    });

    it('omits branch segment when branch name is empty', () => {
      // No branch from git or input — segment should not appear
      const ctx = makeCtx({ git: { ...EMPTY_GIT, branch: '' } });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      // Output may contain model but not a branch glyph with empty name
      expect(out).not.toMatch(/^\s*\|\s*\s*$/);
    });

    it('uses dirty background when git has modified files', () => {
      const dirtyGit: GitStatus = { branch: 'main', staged: 0, modified: 3, untracked: 0 };
      const cleanGit: GitStatus = { branch: 'main', staged: 0, modified: 0, untracked: 0 };

      const dirtyCtx = makeCtx({ git: dirtyGit });
      const cleanCtx = makeCtx({ git: cleanGit });

      const dirtyOut = renderPowerlineLine1(dirtyCtx, 'truecolor', null);
      const cleanOut = renderPowerlineLine1(cleanCtx, 'truecolor', null);

      // The two outputs should differ (dirty vs clean background)
      expect(dirtyOut).not.toBe(cleanOut);
    });

    it('uses dirty background when git has staged files', () => {
      const dirtyGit: GitStatus = { branch: 'fix/staged', staged: 2, modified: 0, untracked: 0 };
      const cleanGit: GitStatus = { branch: 'fix/staged', staged: 0, modified: 0, untracked: 0 };

      const dirtyCtx = makeCtx({ git: dirtyGit });
      const cleanCtx = makeCtx({ git: cleanGit });

      const dirtyOut = renderPowerlineLine1(dirtyCtx, 'truecolor', null);
      const cleanOut = renderPowerlineLine1(cleanCtx, 'truecolor', null);

      expect(dirtyOut).not.toBe(cleanOut);
    });

    it('appends staged/modified/untracked badges when dirty', () => {
      const ctx = makeCtx({
        git: { branch: 'main', staged: 2, modified: 1, untracked: 3 },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('+2');
      expect(out).toContain('!1');
      expect(out).toContain('?3');
    });

    it('does not show dirty badges when display.gitChanges is false', () => {
      const ctx = makeCtx({
        git: { branch: 'main', staged: 2, modified: 1, untracked: 3 },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, gitChanges: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('+2');
      expect(out).not.toContain('!1');
      expect(out).not.toContain('?3');
    });

    it('truncates very long branch names to at most 40 chars', () => {
      const longBranch = 'feature/' + 'a'.repeat(50);
      const ctx = makeCtx({ git: { ...EMPTY_GIT, branch: longBranch } });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      // The full branch name should not appear untruncated
      expect(out).not.toContain(longBranch);
    });
  });

  // ── Directory segment ───────────────────────────────────────────────

  describe('directory segment', () => {
    it('renders basename of cwd', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }), cwd: '/home/user/projects/lumira' },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('lumira');
    });

    it('omits directory segment when display.directory is false', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }), cwd: '/home/user/lumira' },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, directory: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('lumira');
    });

    it('omits directory segment when cwd is empty', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }), cwd: '' },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      // Just ensure the render doesn't crash and shows model
      expect(out).toContain('Claude');
    });

    it('wraps directory path in OSC 8 hyperlink when hyperlinks are enabled', () => {
      _setHyperlinkSupport(true);
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }), cwd: '/home/user/lumira' },
      });
      const out = renderPowerlineLine1(ctx, 'truecolor', null);
      // OSC 8 sequence: \x1b]8;;file://...\x1b\
      expect(out).toContain('\x1b]8;;file:///home/user/lumira\x1b\\');
    });

    it('does NOT wrap directory path in hyperlink when hyperlinks are disabled', () => {
      _setHyperlinkSupport(false);
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }), cwd: '/home/user/lumira' },
      });
      const out = renderPowerlineLine1(ctx, 'truecolor', null);
      expect(out).not.toContain('\x1b]8;;');
    });
  });

  // ── Version segment ─────────────────────────────────────────────────

  describe('version segment', () => {
    it('renders version when input.version is present', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }),
          version: '1.2.3',
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('v1.2.3');
    });

    it('omits version segment when display.version is false', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }),
          version: '1.2.3',
        },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, version: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('v1.2.3');
    });

    it('omits version segment when input.version is absent', () => {
      const ctx = makeCtx();
      // Default rawInput has no version field
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toMatch(/v\d+\.\d+\.\d+/);
    });

    it('links version to npmjs.com when hyperlinks are enabled', () => {
      _setHyperlinkSupport(true);
      const ctx = makeCtx({
        input: {
          ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }),
          version: '1.2.3',
        },
      });
      const out = renderPowerlineLine1(ctx, 'truecolor', null);
      expect(out).toContain('npmjs.com/package/@anthropic-ai/claude-code/v/1.2.3');
    });
  });

  // ── Duration segment ────────────────────────────────────────────────

  describe('duration segment', () => {
    it('renders formatted duration when durationMs is present', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0.10, total_duration_ms: 185000 } }),
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      // 185000ms = 3m 5s or similar formatted string
      expect(out).toMatch(/\d+m\s*\d+s|\d+s/);
    });

    it('omits duration segment when display.duration is false', () => {
      const ctx = makeCtx({
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, duration: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      // Duration was 185000ms; with toggle off, no time format should appear
      expect(out).not.toMatch(/3m\s*5s/);
    });

    it('omits duration segment when durationMs is null', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }),
          durationMs: undefined,
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toMatch(/\d+m\s*\d+s/);
    });
  });

  // ── Memory segment ──────────────────────────────────────────────────

  describe('memory segment', () => {
    it('renders memory percentage when memory info is present', () => {
      const ctx = makeCtx({
        memory: { usedBytes: 800_000_000, totalBytes: 1_000_000_000, percentage: 80 },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('80% mem');
    });

    it('omits memory segment when memory is null', () => {
      const ctx = makeCtx({ memory: null });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('% mem');
    });

    it('omits memory segment when display.memory is false', () => {
      const ctx = makeCtx({
        memory: { usedBytes: 500_000_000, totalBytes: 1_000_000_000, percentage: 50 },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, memory: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('50% mem');
    });
  });

  // ── Token speed segment ─────────────────────────────────────────────

  describe('tokenSpeed segment', () => {
    it('renders token speed when tokenSpeed is provided', () => {
      const ctx = makeCtx({ tokenSpeed: 42 });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('42 tok/s');
    });

    it('omits token speed segment when tokenSpeed is null', () => {
      const ctx = makeCtx({ tokenSpeed: null });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('tok/s');
    });

    it('omits token speed segment when display.tokenSpeed is false', () => {
      const ctx = makeCtx({
        tokenSpeed: 99,
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, tokenSpeed: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('tok/s');
    });
  });

  // ── Active todo segment ─────────────────────────────────────────────

  describe('active todo segment', () => {
    it('renders in_progress todo content', () => {
      const ctx = makeCtx({
        transcript: {
          ...EMPTY_TRANSCRIPT,
          todos: [
            { id: '1', content: 'Implement feature X', status: 'in_progress' },
            { id: '2', content: 'Write tests', status: 'pending' },
          ],
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('Implement feature X');
    });

    it('does not show pending todos as active task', () => {
      const ctx = makeCtx({
        transcript: {
          ...EMPTY_TRANSCRIPT,
          todos: [
            { id: '1', content: 'Pending task', status: 'pending' },
          ],
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('Pending task');
    });

    it('does not show completed todos as active task', () => {
      const ctx = makeCtx({
        transcript: {
          ...EMPTY_TRANSCRIPT,
          todos: [
            { id: '1', content: 'Done task', status: 'completed' },
          ],
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('Done task');
    });

    it('shows only the first in_progress todo when multiple exist', () => {
      const ctx = makeCtx({
        transcript: {
          ...EMPTY_TRANSCRIPT,
          todos: [
            { id: '1', content: 'First active', status: 'in_progress' },
            { id: '2', content: 'Second active', status: 'in_progress' },
          ],
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('First active');
      expect(out).not.toContain('Second active');
    });

    it('truncates long todo content to 30 chars', () => {
      const longTodo = 'This is a very long task description that exceeds the limit';
      const ctx = makeCtx({
        transcript: {
          ...EMPTY_TRANSCRIPT,
          todos: [{ id: '1', content: longTodo, status: 'in_progress' }],
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain(longTodo);
    });
  });

  // ── Parity widgets (linesChanged / worktree / agent / sessionName / style)
  // Classic line1 has rendered these for several releases; powerline-line1
  // silently dropped them until v1.2.2. Tests pin both shapes (toggle on +
  // value present → segment appears; toggle off → not).

  describe('linesChanged segment', () => {
    it('renders +N -M when added or removed > 0', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0, total_lines_added: 16, total_lines_removed: 4 },
          }),
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('+16 -4');
    });

    it('renders segment when only lines are removed (added = 0)', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0, total_lines_added: 0, total_lines_removed: 7 },
          }),
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('+0 -7');
    });

    it('omits segment when both added and removed are 0', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
          }),
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toMatch(/\+0 -0/);
    });

    it('omits segment when display.linesChanged is false', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0, total_lines_added: 99, total_lines_removed: 99 },
          }),
        },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, linesChanged: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('+99');
    });
  });

  describe('worktree segment', () => {
    it('renders worktree name when present', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 }, worktree: { name: 'feat-x' } }) },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('feat-x');
    });

    it('omits segment when worktreeName is undefined', () => {
      const ctx = makeCtx();
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('feat-');
    });

    it('omits segment when display.worktree is false', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 }, worktree: { name: 'feat-x' } }) },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, worktree: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('feat-x');
    });
  });

  describe('agent segment', () => {
    it('renders explicit input.agentName', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 }, agent: { name: 'code-reviewer' } }) },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('code-reviewer');
    });

    it('renders single named running subagent from transcript', () => {
      const ctx = makeCtx({
        transcript: { ...EMPTY_TRANSCRIPT, agents: [{ id: 'a1', type: 'code-reviewer', status: 'running' }] },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('code-reviewer');
    });

    it('omits segment when multiple named agents are running (collapses to line 3)', () => {
      const ctx = makeCtx({
        transcript: {
          ...EMPTY_TRANSCRIPT,
          agents: [
            { id: 'a1', type: 'code-reviewer', status: 'running' },
            { id: 'a2', type: 'security-auditor', status: 'running' },
          ],
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('code-reviewer');
      expect(out).not.toContain('security-auditor');
    });

    it('omits segment when display.agent is false', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 }, agent: { name: 'code-reviewer' } }) },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, agent: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('code-reviewer');
    });
  });

  describe('sessionName segment', () => {
    it('renders session name when present', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 }, session_name: 'main-flow' }) },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('main-flow');
    });

    it('omits segment when display.sessionName is false', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 }, session_name: 'main-flow' }) },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, sessionName: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('main-flow');
    });
  });

  describe('style segment', () => {
    it('renders output style name when present', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 }, output_style: { name: 'jarvis' } }) },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('jarvis');
    });

    it('omits segment when display.style is false', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 }, output_style: { name: 'jarvis' } }) },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, style: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('jarvis');
    });
  });

  // ── Segment priorities / eviction ───────────────────────────────────

  describe('segment priority ordering', () => {
    it('model (priority 100) appears before version (priority 20) in output', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({ model: 'Claude Sonnet 4.6', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }),
          version: '2.0.0',
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      const modelIdx = out.indexOf('Claude Sonnet 4.6');
      const versionIdx = out.indexOf('v2.0.0');
      expect(modelIdx).toBeGreaterThanOrEqual(0);
      expect(versionIdx).toBeGreaterThanOrEqual(0);
      expect(modelIdx).toBeLessThan(versionIdx);
    });

    it('branch (priority 80) appears before version (priority 20) in output', () => {
      const ctx = makeCtx({
        git: { ...EMPTY_GIT, branch: 'main' },
        input: {
          ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90 }, cost: { total_cost_usd: 0, total_duration_ms: 0 } }),
          version: '1.0.0',
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      const branchIdx = out.indexOf('main');
      const versionIdx = out.indexOf('v1.0.0');
      expect(branchIdx).toBeGreaterThanOrEqual(0);
      expect(versionIdx).toBeGreaterThanOrEqual(0);
      expect(branchIdx).toBeLessThan(versionIdx);
    });
  });

  // ── Output format ───────────────────────────────────────────────────

  describe('output format', () => {
    it('returns non-empty string with ANSI color codes in truecolor mode', () => {
      const ctx = makeCtx();
      const out = renderPowerlineLine1(ctx, 'truecolor', null);
      expect(out).toBeTruthy();
      expect(out).toContain('\x1b[48;2;');
    });

    it('ends with reset escape in truecolor mode', () => {
      const ctx = makeCtx();
      const out = renderPowerlineLine1(ctx, 'truecolor', null);
      expect(out.endsWith('\x1b[0m')).toBe(true);
    });

    it('projects to 256-color escapes in 256 mode', () => {
      const ctx = makeCtx();
      const out = renderPowerlineLine1(ctx, '256', null);
      expect(out).toMatch(/\x1b\[48;5;\d+m/);
      expect(out).not.toContain('\x1b[48;2;');
    });

    it('returns empty string when all segments produce no content', () => {
      // model toggle off, no branch, no cwd, no version, no duration/memory/tokenSpeed
      const rawInput = {
        model: '',
        session_id: 'test',
        context_window: { used_percentage: 0, remaining_percentage: 100 },
        cost: { total_cost_usd: 0, total_duration_ms: 0 },
      };
      const ctx = makeCtx({
        input: { ...normalize(rawInput), cwd: '', durationMs: undefined, version: undefined },
        git: { ...EMPTY_GIT },
        tokenSpeed: null,
        memory: null,
        config: {
          ...DEFAULT_CONFIG,
          display: {
            ...DEFAULT_DISPLAY,
            model: true,       // on, but model name is empty → no segment
            branch: true,      // on, but no branch → no segment
            directory: true,   // on, but cwd is empty → no segment
            version: true,     // on, but no version → no segment
            duration: true,    // on, but durationMs undefined → no segment
            memory: true,      // on, but memory null → no segment
            tokenSpeed: true,  // on, but tokenSpeed null → no segment
          },
        },
      });
      const out = renderPowerlineLine1(ctx, 'truecolor', null);
      expect(out).toBe('');
    });
  });

  // ── Multiple segments together ──────────────────────────────────────

  describe('combined segments', () => {
    it('renders model, branch, directory, and version together', () => {
      _setHyperlinkSupport(false);
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude Opus',
            session_id: 'combined',
            context_window: { used_percentage: 30, remaining_percentage: 70 },
            cost: { total_cost_usd: 1.00, total_duration_ms: 60000 },
          }),
          cwd: '/home/user/myproject',
          version: '3.0.0',
        },
        git: { ...EMPTY_GIT, branch: 'develop' },
        tokenSpeed: null,
        memory: null,
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('Claude Opus');
      expect(out).toContain('develop');
      expect(out).toContain('myproject');
      expect(out).toContain('v3.0.0');
    });

    it('renders memory, tokenSpeed, and duration together', () => {
      const ctx = makeCtx({
        tokenSpeed: 55,
        memory: { usedBytes: 600_000_000, totalBytes: 1_000_000_000, percentage: 60 },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('55 tok/s');
      expect(out).toContain('60% mem');
    });

    it('renders all five parity widgets together (linesChanged + worktree + agent + sessionName + style)', () => {
      const ctx = makeCtx({
        cols: 250,
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            session_name: 'main-flow',
            output_style: { name: 'jarvis' },
            agent: { name: 'code-reviewer' },
            worktree: { name: 'feat-x' },
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0, total_lines_added: 21, total_lines_removed: 14 },
          }),
        },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('+21 -14');
      expect(out).toContain('feat-x');
      expect(out).toContain('code-reviewer');
      expect(out).toContain('main-flow');
      expect(out).toContain('jarvis');
    });
  });

  // ── Custom commands (issue #143 phase 3) ─────────────────────────
  describe('custom commands', () => {
    it('renders an ok line-1 command as a powerline segment', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'CUSTOM', state: 'ok', line: 1, ansi: false }],
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('CUSTOM');
    });

    it('ignores hidden state outputs', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'GONE', state: 'hidden', line: 1, ansi: false }],
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('GONE');
    });

    it('does not render commands targeting other lines', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'OTHER', state: 'ok', line: 2, ansi: false }],
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('OTHER');
    });

    it('dims a stale command', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'fading', state: 'stale', line: 1, ansi: false }],
      });
      const raw = renderPowerlineLine1(ctx, 'truecolor', null);
      expect(raw).toContain('\x1b[2m');
    });
  });

  // ── Added dirs segment (issue #129) ─────────────────────────────────
  describe('added dirs segment', () => {
    it('should_add_segment_for_added_dirs_when_display_addedDirs_is_true_and_count_gt_0', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            workspace: { current_dir: '/tmp', added_dirs: ['/a', '/b'] },
          }),
        },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('+2 dirs');
    });

    it('should_not_add_segment_when_count_is_0', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            workspace: { current_dir: '/tmp', added_dirs: [] },
          }),
        },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('dirs');
    });

    it('should_place_added_dirs_segment_after_directory_with_priority_61', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            workspace: { current_dir: '/home/user/myproject', added_dirs: ['/x'] },
          }),
        },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      const dirIdx = out.indexOf('myproject');
      const badgeIdx = out.indexOf('+1 dirs');
      expect(dirIdx).toBeGreaterThanOrEqual(0);
      expect(badgeIdx).toBeGreaterThanOrEqual(0);
      expect(dirIdx).toBeLessThan(badgeIdx);
    });

    it('should_apply_warning_color_to_segment_when_count_gte_5', () => {
      const dirs = ['/1', '/2', '/3', '/4', '/5'];
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            workspace: { current_dir: '/tmp', added_dirs: dirs },
          }),
        },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('+5 dirs');

      const withDirs4 = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            workspace: { current_dir: '/tmp', added_dirs: ['/1', '/2', '/3', '/4'] },
          }),
        },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } },
      });
      const outWarn = renderPowerlineLine1(ctx, 'truecolor', null);
      const outNorm = renderPowerlineLine1(withDirs4, 'truecolor', null);
      expect(outWarn).not.toBe(outNorm);
    });
  });

  // ── Worktree breadcrumb segment (issue #130) ─────────────────────────
  describe('worktree breadcrumb segment', () => {
    it('should_render_breadcrumb_when_original_branch_present_and_differs_from_current', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            worktree: { name: 'feat-wt', original_branch: 'main' },
          }),
        },
        git: { ...EMPTY_GIT, branch: 'feat/my-feature' },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, worktreeBreadcrumb: true } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('↳ main');
    });

    it('should_not_render_breadcrumb_when_original_branch_is_missing', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            worktree: { name: 'feat-wt' },
          }),
        },
        git: { ...EMPTY_GIT, branch: 'feat/x' },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('↳');
    });

    it('should_not_render_breadcrumb_when_original_branch_equals_current_branch', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            worktree: { name: 'wt', original_branch: 'main' },
          }),
        },
        git: { ...EMPTY_GIT, branch: 'main' },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('↳');
    });

    it('should_truncate_long_original_branch_to_15_chars', () => {
      const longBranch = 'feature/' + 'a'.repeat(50);
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            worktree: { name: 'wt', original_branch: longBranch },
          }),
        },
        git: { ...EMPTY_GIT, branch: 'develop' },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, worktreeBreadcrumb: true } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).toContain('↳ ');
      expect(out).not.toContain(longBranch);
      expect(out).toContain('…');
    });

    it('should_respect_display_worktreeBreadcrumb_toggle', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            worktree: { name: 'wt', original_branch: 'main' },
          }),
        },
        git: { ...EMPTY_GIT, branch: 'feat/x' },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, worktreeBreadcrumb: false } },
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      expect(out).not.toContain('↳');
    });

    it('powerline_renderer_should_emit_breadcrumb_as_single_segment_with_correct_priority', () => {
      const ctx = makeCtx({
        input: {
          ...normalize({
            model: 'Claude',
            session_id: 't',
            context_window: { used_percentage: 10, remaining_percentage: 90 },
            cost: { total_cost_usd: 0, total_duration_ms: 0 },
            worktree: { name: 'feat-wt', original_branch: 'develop' },
          }),
        },
        git: { ...EMPTY_GIT, branch: 'feat/x' },
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, worktree: true, worktreeBreadcrumb: true } },
        cols: 250,
      });
      const out = stripAnsi(renderPowerlineLine1(ctx, 'truecolor', null));
      const worktreeIdx = out.indexOf('feat-wt');
      const breadcrumbIdx = out.indexOf('↳ develop');
      expect(worktreeIdx).toBeGreaterThanOrEqual(0);
      expect(breadcrumbIdx).toBeGreaterThanOrEqual(0);
      expect(worktreeIdx).toBeLessThan(breadcrumbIdx);
    });
  });
});
