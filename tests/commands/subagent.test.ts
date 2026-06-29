/**
 * Tests for `lumira subagent` subcommand (issue #176 — subagentStatusLine renderer).
 *
 * Claude Code (≥ 2.1.x) pipes every visible subagent row as JSON on stdin and
 * expects one `{ id, content }` JSON line back per row. These tests pin:
 *   - per-state rendering (icon + color + label) for running/completed/error
 *   - graceful handling of unknown states and missing fields
 *   - name fallback chain and token-segment omission
 *   - `columns` truncation of the name
 *   - the JSON-lines output contract (one line per addressable task)
 *   - the command wiring: reads stdin, never crashes CC on bad input
 *
 * Rendering assertions strip ANSI for text and separately assert glyph/colour
 * presence, so they don't couple to exact escape sequences.
 */
import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import {
  renderSubagentContent,
  renderSubagentTasks,
  runSubagentCommand,
} from '../../src/commands/subagent.js';
import { NERD_ICONS, EMOJI_ICONS, NO_ICONS } from '../../src/render/icons.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { displayWidth } from '../../src/render/text.js';
import type { SubagentTask, SubagentInput, HudConfig } from '../../src/types.js';

const colors = createColors('named');

function task(over: Partial<SubagentTask> = {}): SubagentTask {
  return { id: 'a1', name: 'code-reviewer', status: 'running', tokenCount: 15000, ...over };
}

describe('renderSubagentContent', () => {
  it('renders a running task: clock glyph, name, dim tokens, running label', () => {
    const out = renderSubagentContent(task(), NERD_ICONS, colors);
    const plain = stripAnsi(out);
    expect(plain).toContain('code-reviewer');
    expect(plain).toContain('15k tok');
    expect(plain).toContain('running');
    expect(out).toContain(NERD_ICONS.clock); // state glyph present
  });

  it('renders a completed task with checkmark + done label', () => {
    const out = renderSubagentContent(task({ status: 'completed' }), NERD_ICONS, colors);
    const plain = stripAnsi(out);
    expect(plain).toContain('done');
    expect(out).toContain(NERD_ICONS.checkmark);
  });

  it('renders an error task with warning glyph + error label', () => {
    const out = renderSubagentContent(task({ status: 'error' }), NERD_ICONS, colors);
    const plain = stripAnsi(out);
    expect(plain).toContain('error');
    expect(out).toContain(NERD_ICONS.warning);
  });

  it('passes an unknown status through as plain text with no glyph', () => {
    const out = renderSubagentContent(task({ status: 'queued' }), NERD_ICONS, colors);
    const plain = stripAnsi(out);
    expect(plain).toContain('queued');
    // none of the state glyphs should appear
    expect(out).not.toContain(NERD_ICONS.clock);
    expect(out).not.toContain(NERD_ICONS.checkmark);
    expect(out).not.toContain(NERD_ICONS.warning);
  });

  it('omits the token segment when tokenCount is missing', () => {
    const out = renderSubagentContent(task({ tokenCount: undefined }), NERD_ICONS, colors);
    expect(stripAnsi(out)).not.toContain('tok');
  });

  it('falls back to type then id when name is absent', () => {
    expect(stripAnsi(renderSubagentContent(task({ name: undefined, type: 'investigation' }), NERD_ICONS, colors)))
      .toContain('investigation');
    expect(stripAnsi(renderSubagentContent(task({ name: undefined, type: undefined, id: 'xyz' }), NERD_ICONS, colors)))
      .toContain('xyz');
  });

  it('truncates the name to fit the columns budget', () => {
    const longName = 'a-really-long-subagent-name-that-overflows-the-row';
    const out = renderSubagentContent(task({ name: longName }), NO_ICONS, colors, 24);
    const plain = stripAnsi(out);
    expect(displayWidth(plain)).toBeLessThanOrEqual(24);
    expect(plain).toContain('…'); // ellipsis
  });

  it('renders tokenCount of 0 as "0 tok" (a just-started agent), not blank', () => {
    const out = renderSubagentContent(task({ tokenCount: 0 }), NO_ICONS, colors);
    expect(stripAnsi(out)).toContain('0 tok');
  });

  it('emits no leading glyph in none-icons mode for running (clock is empty)', () => {
    const out = renderSubagentContent(task(), NO_ICONS, colors);
    const plain = stripAnsi(out);
    expect(plain.startsWith('code-reviewer')).toBe(true);
  });

  it('supports emoji icon set', () => {
    const out = renderSubagentContent(task({ status: 'completed' }), EMOJI_ICONS, colors);
    expect(out).toContain(EMOJI_ICONS.checkmark);
  });
});

describe('renderSubagentTasks', () => {
  it('emits one JSON line per task with id + content', () => {
    const input: SubagentInput = {
      columns: 120,
      tasks: [task({ id: 'a1' }), task({ id: 'b2', status: 'completed' })],
    };
    const out = renderSubagentTasks(input, NO_ICONS, colors);
    const lines = out.split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first.id).toBe('a1');
    expect(typeof first.content).toBe('string');
    expect(JSON.parse(lines[1]).id).toBe('b2');
  });

  it('skips tasks without an id (an unaddressable row)', () => {
    const input = { tasks: [task({ id: '' }), task({ id: 'ok' })] } as SubagentInput;
    const out = renderSubagentTasks(input, NO_ICONS, colors);
    expect(out.split('\n')).toHaveLength(1);
    expect(JSON.parse(out).id).toBe('ok');
  });

  it('returns an empty string for an empty or missing task list', () => {
    expect(renderSubagentTasks({ tasks: [] }, NO_ICONS, colors)).toBe('');
    expect(renderSubagentTasks({} as SubagentInput, NO_ICONS, colors)).toBe('');
  });
});

describe('runSubagentCommand', () => {
  const cfg: HudConfig = { icons: 'none', colors: { mode: 'named' } } as HudConfig;

  function streamOf(json: string): Readable {
    return Readable.from([json]);
  }

  it('reads stdin and prints one JSON line per task, exit 0', async () => {
    const payload = JSON.stringify({ columns: 100, tasks: [task({ id: 'z9' })] });
    const r = await runSubagentCommand({
      stream: streamOf(payload),
      config: cfg,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe('');
    const line = r.stdout.trim();
    expect(JSON.parse(line).id).toBe('z9');
  });

  it('never crashes CC on malformed stdin — empty stdout, exit 0', async () => {
    const r = await runSubagentCommand({
      stream: streamOf('not json at all'),
      config: cfg,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('emits nothing when there are no tasks', async () => {
    const r = await runSubagentCommand({
      stream: streamOf(JSON.stringify({ columns: 80, tasks: [] })),
      config: cfg,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('');
  });
});
