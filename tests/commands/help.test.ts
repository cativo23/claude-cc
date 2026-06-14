import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDir, '../../');
const distPath = join(projectRoot, 'dist/index.js');

function runLumira(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [distPath, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('close', (code: number) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
  });
}

describe('Help and Version commands', () => {
  it('--help prints usage to stdout and exits 0', async () => {
    const result = await runLumira(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('lumira');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Commands:');
  });

  it('-h prints usage to stdout and exits 0', async () => {
    const result = await runLumira(['-h']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('lumira');
    expect(result.stdout).toContain('Usage:');
  });

  it('--version prints version to stdout and exits 0', async () => {
    const result = await runLumira(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1.9.0');
  });

  it('-v prints version to stdout and exits 0', async () => {
    const result = await runLumira(['-v']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1.9.0');
  });

  it('unknown command prints error to stderr and exits 1', async () => {
    const result = await runLumira(['bogus']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command: bogus');
    expect(result.stderr).toContain('--help');
  });

  it('known command "install" does not trigger unknown-command path', async () => {
    // This test ensures install is recognized - it will error differently
    // (not as "unknown command"), but for this test we just check the exit code
    // isn't from the unknown command handler and stderr doesn't say "Unknown command"
    const result = await runLumira(['install']);
    expect(result.stderr).not.toContain('Unknown command: install');
  });

  it('known command "stats" does not trigger unknown-command path', async () => {
    const result = await runLumira(['stats']);
    expect(result.stderr).not.toContain('Unknown command: stats');
  });
});
