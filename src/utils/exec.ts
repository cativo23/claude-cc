import { execFile } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
}

export function safeExec(cmd: string, args: string[], opts: ExecOptions = {}): Promise<string> {
  const { cwd, timeoutMs = 2000 } = opts;
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, encoding: 'utf8' }, (error, stdout) => {
      if (error) { resolve(''); return; }
      resolve((stdout ?? '').trim());
    });
  });
}
