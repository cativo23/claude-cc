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
          if (/^\/dev\/(pts\/\d+|tty[a-zA-Z0-9]*)$/.test(link)) {
            const out = execSync(`stty size < ${link}`, { shell: '/bin/sh', timeout: 500, encoding: 'utf8' }).trim();
            const cols = parseInt(out.split(/\s+/)[1], 10);
            if (cols > 0) return cols;
          }
        } catch {}
      }
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      // comm field (index 1) is wrapped in parens and can contain spaces.
      // Parse everything after the last ')' to correctly locate ppid (field index 3).
      const tail = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      pid = parseInt(tail[1], 10); // tail[0]=state, tail[1]=ppid
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

// When stdout isn't a TTY (the statusline case — Claude Code pipes our output)
// we still trust the resolved rawCols since proc-tree / COLUMNS / tput give the
// real terminal width. The small 0.9 factor leaves 10% headroom for any chrome
// the host renderer adds (separators, gutters) without aggressively starving
// segments. Was 0.7 historically — too conservative for CC, where the
// statusline uses the full terminal width.
export function getLayoutCols(rawCols: number, isTTY: boolean, factor: number = 0.9): number {
  if (isTTY) return rawCols;
  const clamped = Math.min(Math.max(factor, 0.3), 1.0);
  return Math.floor(rawCols * clamped);
}
