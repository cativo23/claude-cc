import { readdirSync, readlinkSync, readFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';

function getTermColsFromProcTree(): number {
  try {
    let pid = process.ppid;
    for (let i = 0; i < 5 && pid > 1; i++) {
      const fds = readdirSync(`/proc/${pid}/fd`);
      for (const fd of fds) {
        try {
          const link = readlinkSync(`/proc/${pid}/fd/${fd}`);
          if (link.startsWith('/dev/pts/') || link === '/dev/tty') {
            // SECURITY NOTE: `link` comes from reading /proc/{pid}/fd symlinks (kernel-controlled),
            // never from user input. Shell is required for the stdin redirect syntax `< /dev/pts/N`.
            const out = execSync(`stty size < ${link}`, { shell: '/bin/sh', timeout: 500, encoding: 'utf8' }).trim();
            const cols = parseInt(out.split(/\s+/)[1], 10);
            if (cols > 0) return cols;
          }
        } catch {}
      }
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      pid = parseInt(stat.split(' ')[3], 10);
    }
  } catch {}
  return 0;
}

export function getTermCols(): number {
  let cols = process.stdout.columns || process.stderr.columns;
  if (cols) return cols;
  cols = parseInt(process.env['COLUMNS'] ?? '', 10);
  if (cols > 0) return cols;
  cols = getTermColsFromProcTree();
  if (cols > 0) return cols;
  try {
    cols = parseInt(execFileSync('tput', ['cols'], { stdio: ['inherit', 'pipe', 'pipe'], timeout: 500, encoding: 'utf8' }).trim(), 10);
    if (cols > 0) return cols;
  } catch {}
  return 120;
}

export function getLayoutCols(rawCols: number, isTTY: boolean, factor: number = 0.7): number {
  if (isTTY) return rawCols;
  const clamped = Math.min(Math.max(factor, 0.3), 1.0);
  return Math.floor(rawCols * clamped);
}
