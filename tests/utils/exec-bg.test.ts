import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execBg } from '../../src/utils/exec-bg.js';

describe('execBg', () => {
  it('happy path — captures stdout and resolves ok', async () => {
    const result = await execBg({
      command: ['node', '-e', "process.stdout.write('hi')"],
      timeoutMs: 1500,
      maxBytes: 1024,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.stdout).toBe('hi');
      expect(result.truncated).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(typeof result.durationMs).toBe('number');
    }
  }, 3000);

  it('truncates stdout when exceeding maxBytes and kills process', async () => {
    const result = await execBg({
      command: ['node', '-e', "setInterval(() => process.stdout.write('x'.repeat(1000)), 5)"],
      timeoutMs: 1500,
      maxBytes: 100,
    });
    // We may either receive 'ok' (exit 0 after kill on some platforms) or 'nonzero'.
    expect(['ok', 'nonzero']).toContain(result.kind);
    if (result.kind === 'ok') {
      expect(result.truncated).toBe(true);
      expect(result.stdout.length).toBe(100);
    } else if (result.kind === 'nonzero') {
      expect(result.stdout.length).toBe(100);
    }
  }, 3000);

  it('returns timeout when wall-clock exceeded', async () => {
    const start = Date.now();
    const result = await execBg({
      command: ['node', '-e', 'setInterval(() => {}, 1000)'],
      timeoutMs: 200,
      maxBytes: 1024,
    });
    const elapsed = Date.now() - start;
    expect(result.kind).toBe('timeout');
    if (result.kind === 'timeout') {
      expect(typeof result.durationMs).toBe('number');
    }
    expect(elapsed).toBeLessThan(1500);
  }, 3000);

  it('reports non-zero exit code', async () => {
    const result = await execBg({
      command: ['node', '-e', 'process.exit(42)'],
      timeoutMs: 1500,
      maxBytes: 1024,
    });
    expect(result.kind).toBe('nonzero');
    if (result.kind === 'nonzero') {
      expect(result.exitCode).toBe(42);
    }
  }, 3000);

  it('reports spawn error for non-existent binary', async () => {
    const result = await execBg({
      command: ['/this/binary/does/not/exist/lumira-test'],
      timeoutMs: 1500,
      maxBytes: 1024,
    });
    expect(result.kind).toBe('spawn-error');
    if (result.kind === 'spawn-error') {
      expect(result.message.length).toBeGreaterThan(0);
    }
  }, 3000);

  it('strips unwanted env vars by default — only curated set passes through', async () => {
    // Set a custom var on the parent that should NOT leak unless explicitly forwarded.
    process.env.LUMIRA_TEST_LEAK = 'should-not-be-visible';
    try {
      const result = await execBg({
        command: ['node', '-e', "process.stdout.write(String(process.env.LUMIRA_TEST_LEAK || 'undef'))"],
        timeoutMs: 1500,
        maxBytes: 1024,
      });
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.stdout).toBe('undef');
      }
    } finally {
      delete process.env.LUMIRA_TEST_LEAK;
    }
  }, 3000);

  it('passes user env on top of curated minimum', async () => {
    const result = await execBg({
      command: ['node', '-e', "process.stdout.write(String(process.env.LUMIRA_CUSTOM || 'undef'))"],
      timeoutMs: 1500,
      maxBytes: 1024,
      env: { LUMIRA_CUSTOM: 'visible' },
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.stdout).toBe('visible');
    }
  }, 3000);

  it('pipes stdin to the child process', async () => {
    const result = await execBg({
      command: ['node', '-e', "let s=''; process.stdin.on('data', d => s+=d); process.stdin.on('end', () => process.stdout.write('got:' + s))"],
      timeoutMs: 1500,
      maxBytes: 1024,
      stdin: 'hello',
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.stdout).toBe('got:hello');
    }
  }, 3000);

  it('kills entire process group on timeout (child of child also gone)', async () => {
    // Parent spawns a long-running detached child that writes its PID to a temp file.
    const dir = mkdtempSync(join(tmpdir(), 'lumira-exec-bg-pgkill-'));
    const pidFile = join(dir, 'child.pid');
    try {
      const script = `
        const { spawn } = require('child_process');
        const fs = require('fs');
        const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
        setInterval(() => {}, 1000);
      `;
      const result = await execBg({
        command: ['node', '-e', script],
        timeoutMs: 300,
        maxBytes: 1024,
      });
      expect(result.kind).toBe('timeout');

      // Give the kill propagation a moment.
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(existsSync(pidFile)).toBe(true);
      const { readFileSync } = await import('node:fs');
      const childPid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
      expect(Number.isFinite(childPid)).toBe(true);

      // Check whether the child PID is still alive.
      let stillAlive = false;
      try {
        process.kill(childPid, 0);
        stillAlive = true;
      } catch {
        stillAlive = false;
      }
      expect(stillAlive).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 3000);
});
