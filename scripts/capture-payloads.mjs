#!/usr/bin/env node
/**
 * Statusline wrapper that tees Claude Code's stdin payload to a per-call file
 * before forwarding to lumira. Used to collect real sample data for the
 * asciinema demo (scripts/build-asciinema.mjs reads the captures and replays
 * them through lumira to render a .cast).
 *
 * Wire it into ~/.claude/settings.json:
 *   "statusLine": {
 *     "type": "command",
 *     "command": "node /path/to/lumira/scripts/capture-payloads.mjs",
 *     "padding": 0
 *   }
 *
 * Captures land in /tmp/lumira-capture/<timestamp>.json. Forwarding output
 * is unchanged so the statusline still renders normally during capture.
 */

import { mkdirSync, chmodSync, createWriteStream, copyFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LUMIRA = join(__dirname, '..', 'dist', 'index.js');
const CAPTURE_DIR = process.env['LUMIRA_CAPTURE_DIR'] ?? '/tmp/lumira-capture';
const TRANSCRIPT_DIR = join(CAPTURE_DIR, 'transcripts');

mkdirSync(CAPTURE_DIR, { recursive: true, mode: 0o700 });
mkdirSync(TRANSCRIPT_DIR, { recursive: true, mode: 0o700 });
// mkdirSync mode is only applied to dirs it creates. After the first run
// the dir keeps whatever umask gave it, so chmod to enforce 0o700 every
// time. Best-effort — if this fails (foreign filesystem, etc) capture
// still works.
try { chmodSync(CAPTURE_DIR, 0o700); chmodSync(TRANSCRIPT_DIR, 0o700); } catch {}

const ts = `${Date.now()}-${process.pid}`;
const captureFile = join(CAPTURE_DIR, `${ts}.json`);

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { buf += chunk; });
/**
 * Append a path-separator to the prefix before testing — `startsWith()`
 * alone allows sibling matches like "/home/dev-evil" passing for "/home/dev".
 */
function isUnderRoot(resolved, root) {
  const r = root.endsWith(sep) ? root : root + sep;
  return resolved === root || resolved.startsWith(r);
}

process.stdin.on('end', () => {
  // Forward to lumira before doing anything else — capture is auxiliary,
  // and skipping the spawn (e.g. on empty stdin) would replace the user's
  // statusline with a blank row.
  let toWrite = buf;
  if (buf.trim()) {
    try {
      const payload = JSON.parse(buf);
      const tp = payload.transcript_path;
      if (tp && existsSync(tp)) {
        // Mirror lumira's own gate: only snapshot transcripts that resolve
        // under $HOME or /tmp. Defense-in-depth — without this guard a
        // payload pointing at /etc/passwd would be eagerly copied into the
        // capture dir. Use isUnderRoot() so /home/devil doesn't slip past
        // a /home/dev prefix check.
        const resolved = resolve(tp);
        if (isUnderRoot(resolved, homedir()) || isUnderRoot(resolved, tmpdir())) {
          const snapPath = join(TRANSCRIPT_DIR, `${ts}.jsonl`);
          copyFileSync(tp, snapPath);
          payload.transcript_path = snapPath;
          toWrite = JSON.stringify(payload);
        }
      }
    } catch {
      // Best-effort: if snapshotting fails for any reason, fall back to the
      // raw payload so capture still happens.
    }

    try {
      const out = createWriteStream(captureFile);
      out.write(toWrite);
      out.end();
    } catch {
      // Capture is best-effort; failing here must never break the statusline.
    }
  }

  // Forward to lumira itself, identical pipeline. We re-feed the buffered
  // payload via spawn's stdin so output streaming still works the same way.
  const child = spawn('node', [LUMIRA], {
    stdio: ['pipe', 'inherit', 'inherit'],
    env: process.env,
  });
  child.on('error', () => process.exit(1));
  child.on('exit', code => process.exit(code ?? 0));
  child.stdin.write(buf);
  child.stdin.end();
});
