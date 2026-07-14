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
// we trust the resolved rawCols since proc-tree / COLUMNS / tput give the real
// terminal width, and use the full width (factor 1.0). Earlier versions reserved
// headroom (0.7, then 0.9) on the theory that CC appends chrome (separators,
// gutters) to the statusline's own row. Inspecting a real render showed that is
// not the case: CC's own hints ("bypass permissions …", "PR #…", "← for agents")
// render on a SEPARATE line below the statusline, never appended to its row — so
// the reservation was speculative and only ever showed up as empty space at the
// far-right edge. Every renderer that treats `cols` as a width budget already
// protects itself: line1/line2 via fitSegments and the powerline lines via
// renderPowerline both subtract a proven 4-column margin (see text.ts / powerline.ts).
export function getLayoutCols(rawCols: number, isTTY: boolean, factor: number = 1.0): number {
  if (isTTY) return rawCols;
  const clamped = Math.min(Math.max(factor, 0.3), 1.0);
  return Math.floor(rawCols * clamped);
}
