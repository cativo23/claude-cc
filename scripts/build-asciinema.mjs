#!/usr/bin/env node
/**
 * Replay captured Claude Code payloads through lumira and serialize an
 * asciinema v2 .cast file. Pacing follows real-world statusline updates
 * (~3s between renders by default; tunable via FRAME_DELAY_MS).
 *
 * Pipeline:
 *   /tmp/lumira-capture/*.json (from scripts/capture-payloads.mjs)
 *     → filter to one project (--project=<name>)
 *     → optional sanitize (paths, username, cost)
 *     → pipe through `node dist/index.js` to capture rendered ANSI
 *     → write demo.cast with [t, "o", ansi] events
 *
 * Output: assets/showcase/demo.cast (asciinema v2). Upload to asciinema.org
 * for embed + GIF, or convert locally with `agg demo.cast demo.gif`.
 *
 * Usage:
 *   node scripts/build-asciinema.mjs --project=lumira [--sanitize] [--out=demo.cast]
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LUMIRA = join(ROOT, 'dist', 'index.js');

function parseArgs(argv) {
  const out = { project: null, sanitize: false, out: 'assets/showcase/demo.cast', captureDir: '/tmp/lumira-capture', delayMs: 2500, width: 120, height: 8, requireSnapshot: false, sortByContext: false, dedupeByContext: false, maxFrames: 0 };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--project=')) out.project = a.slice(10);
    else if (a === '--sanitize') out.sanitize = true;
    else if (a.startsWith('--out=')) out.out = a.slice(6);
    else if (a.startsWith('--capture-dir=')) out.captureDir = a.slice(14);
    else if (a.startsWith('--delay-ms=')) out.delayMs = parseInt(a.slice(11), 10);
    else if (a.startsWith('--width=')) out.width = parseInt(a.slice(8), 10);
    else if (a.startsWith('--height=')) out.height = parseInt(a.slice(9), 10);
    else if (a === '--require-snapshot') out.requireSnapshot = true;
    else if (a === '--sort-by-context') out.sortByContext = true;
    else if (a === '--dedupe-by-context') out.dedupeByContext = true;
    else if (a.startsWith('--max-frames=')) out.maxFrames = parseInt(a.slice(13), 10);
  }
  return out;
}

function loadCaptures(dir, project, requireSnapshot) {
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort();
  const out = [];
  for (const f of files) {
    let payload;
    try {
      payload = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch { continue; }
    if (project && !(payload.cwd ?? '').endsWith(`/${project}`)) continue;
    if (requireSnapshot) {
      const tp = payload.transcript_path ?? '';
      if (!tp.includes('/transcripts/')) continue;
    }
    out.push({ file: f, payload });
  }
  return out;
}

function sanitize(payload) {
  // Replace user-specific paths and identifying info with neutral demo values.
  const HOME = process.env['HOME'] ?? '/home/user';
  const USER = process.env['USER'] ?? 'user';
  const replacers = [
    [HOME, '/home/dev'],
    [`/${USER}/`, '/dev/'],
  ];
  const json = JSON.stringify(payload);
  let s = json;
  for (const [from, to] of replacers) {
    s = s.split(from).join(to);
  }
  const out = JSON.parse(s);
  // Round cost to a nicer demo number
  if (out.cost?.total_cost_usd != null) {
    out.cost.total_cost_usd = Math.round(out.cost.total_cost_usd * 100) / 100;
  }
  return out;
}

function renderFrame(payload, env) {
  return execFileSync('node', [LUMIRA], {
    input: JSON.stringify(payload),
    env,
    encoding: 'utf8',
  });
}

const args = parseArgs(process.argv);
let captures = loadCaptures(args.captureDir, args.project, args.requireSnapshot);
if (captures.length === 0) {
  console.error(`No captures found in ${args.captureDir}${args.project ? ` for project=${args.project}` : ''}${args.requireSnapshot ? ' (requireSnapshot)' : ''}`);
  process.exit(1);
}

if (args.dedupeByContext) {
  // Keep one capture per (used_percentage, project) so the timeline visibly
  // climbs without 50 frames hovering at the same %.
  const seen = new Set();
  captures = captures.filter(({ payload }) => {
    const pct = payload.context_window?.used_percentage;
    const proj = (payload.cwd ?? '').split('/').pop();
    const key = `${proj}:${pct}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

if (args.sortByContext) {
  captures.sort((a, b) => (a.payload.context_window?.used_percentage ?? 0) - (b.payload.context_window?.used_percentage ?? 0));
}

if (args.maxFrames > 0 && captures.length > args.maxFrames) {
  // Even-spaced subsample so we cover the whole timeline.
  const step = captures.length / args.maxFrames;
  const picked = [];
  for (let i = 0; i < args.maxFrames; i++) picked.push(captures[Math.floor(i * step)]);
  captures = picked;
}

console.log(`Loaded ${captures.length} capture(s) from ${args.captureDir}${args.project ? ` (project=${args.project})` : ''}`);

const env = { ...process.env, COLORTERM: 'truecolor', FORCE_HYPERLINK: '0', LINES: String(args.height), COLUMNS: String(args.width) };

const events = [];
let t = 0;
let lastFrame = '';
let kept = 0, skipped = 0;

for (const { payload } of captures) {
  const finalPayload = args.sanitize ? sanitize(payload) : payload;
  let ansi;
  try {
    ansi = renderFrame(finalPayload, env);
  } catch (e) {
    skipped++;
    continue;
  }
  // Skip duplicates so the timeline doesn't stall on identical frames
  if (ansi === lastFrame) { skipped++; continue; }
  lastFrame = ansi;
  // Clear-and-redraw so each frame replaces the previous fully (asciinema
  // is character-stream based; without clear codes the lines stack).
  // Also replace \n with \r\n: terminals process LF as line-feed only
  // (advance row, keep column). Without the CR, line 2 renders starting
  // at line 1's end column, creating leading whitespace in the player.
  const clear = '\x1b[H\x1b[2J';
  const normalized = ansi.replace(/(?<!\r)\n/g, '\r\n');
  events.push([t, 'o', clear + normalized]);
  t += args.delayMs / 1000;
  kept++;
}

console.log(`Kept ${kept} frame(s), skipped ${skipped} (errors or duplicates).`);

// asciinema v2 cast format: header line as JSON, then events as JSON arrays.
const header = {
  version: 2,
  width: args.width,
  height: args.height,
  timestamp: Math.floor(Date.now() / 1000),
  env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
  title: args.project ? `lumira — ${args.project} session` : 'lumira statusline demo',
};

mkdirSync(dirname(join(ROOT, args.out)), { recursive: true });
const lines = [JSON.stringify(header), ...events.map(e => JSON.stringify(e))];
writeFileSync(join(ROOT, args.out), lines.join('\n') + '\n');
console.log(`Wrote ${join(ROOT, args.out)} (${kept} frames, ${t.toFixed(1)}s total)`);
