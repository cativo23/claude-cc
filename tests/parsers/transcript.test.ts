import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseTranscript, extractToolTarget, normalizeTodoStatus } from '../../src/parsers/transcript.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

describe('parseTranscript', () => {
  it('parses basic tool use and result', async () => {
    const result = await parseTranscript(join(FIXTURES, 'transcript-basic.jsonl'));
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('Read');
    expect(result.tools[0].status).toBe('completed');
    expect(result.tools[0].target).toBe('/src/index.ts');
  });
  it('parses tools with errors and agents', async () => {
    const result = await parseTranscript(join(FIXTURES, 'transcript-tools.jsonl'));
    expect(result.tools.find(t => t.name === 'Bash')?.status).toBe('error');
    expect(result.tools.find(t => t.name === 'Edit')?.status).toBe('running');
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].type).toBe('Explore');
    expect(result.agents[0].status).toBe('completed');
  });
  it('parses TaskCreate and TaskUpdate', async () => {
    const result = await parseTranscript(join(FIXTURES, 'transcript-todos.jsonl'));
    expect(result.todos).toHaveLength(2);
    expect(result.todos[0].content).toBe('Write tests');
    expect(result.todos[0].status).toBe('completed');
    expect(result.todos[1].status).toBe('pending');
  });
  it('returns empty for non-existent file', async () => {
    expect((await parseTranscript('/nonexistent/path.jsonl')).tools).toHaveLength(0);
  });
  it('rejects paths outside allowed directories', async () => {
    expect((await parseTranscript('/etc/passwd')).tools).toHaveLength(0);
  });

  it('extracts thinkingEffort from transcript', async () => {
    const result = await parseTranscript(join(FIXTURES, 'transcript-effort.jsonl'));
    expect(result.thinkingEffort).toBe('high');
  });

  it('sets sessionStart from first timestamp', async () => {
    const result = await parseTranscript(join(FIXTURES, 'transcript-basic.jsonl'));
    expect(result.sessionStart).toBeInstanceOf(Date);
    expect(result.sessionStart!.toISOString()).toBe('2026-04-08T10:00:00.000Z');
  });

  it('handles TodoWrite with merge semantics', async () => {
    const result = await parseTranscript(join(FIXTURES, 'transcript-todowrite.jsonl'));
    expect(result.todos).toHaveLength(3);
    expect(result.todos[0].id).toBe('a');
    expect(result.todos[0].status).toBe('completed');
    expect(result.todos[1].id).toBe('b');
    expect(result.todos[1].status).toBe('in_progress');
    expect(result.todos[2].id).toBe('c');
    expect(result.todos[2].status).toBe('pending');
  });
});

describe('extractToolTarget', () => {
  it('extracts file_path for Read/Write/Edit', () => { expect(extractToolTarget('Read', { file_path: '/src/index.ts' })).toBe('/src/index.ts'); });
  it('extracts pattern for Glob/Grep', () => { expect(extractToolTarget('Glob', { pattern: '**/*.ts' })).toBe('**/*.ts'); });
  it('truncates Bash command at 30 chars', () => { expect(extractToolTarget('Bash', { command: 'a'.repeat(50) })).toBe('a'.repeat(30) + '...'); });
  it('returns undefined for unknown tools', () => { expect(extractToolTarget('Unknown', {})).toBeUndefined(); });
  it('strips control characters from file_path targets', () => {
    const result = extractToolTarget('Read', { file_path: '/safe\x1b[31m/evil\x00.ts' });
    expect(result).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
    expect(result).toContain('/safe');
  });
  it('strips control characters from Bash commands', () => {
    const result = extractToolTarget('Bash', { command: 'ls\x1b[31m -la\x07' });
    expect(result).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
  });
});

describe('normalizeTodoStatus', () => {
  it('normalizes completed/done', () => { expect(normalizeTodoStatus('completed')).toBe('completed'); expect(normalizeTodoStatus('done')).toBe('completed'); });
  it('normalizes in_progress variants', () => { expect(normalizeTodoStatus('in_progress')).toBe('in_progress'); expect(normalizeTodoStatus('running')).toBe('in_progress'); });
  it('defaults to pending', () => { expect(normalizeTodoStatus('whatever')).toBe('pending'); expect(normalizeTodoStatus(undefined)).toBe('pending'); });
});
